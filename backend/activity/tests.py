# activity/tests.py

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from users.models import User, Role
from clients.models import Client
from .models import ActivityLog
from .middleware import _parse_url


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_user(email, role=Role.RECRUITER, password="pass1234"):
    username = email.split("@")[0]
    return User.objects.create_user(
        username=username, password=password,
        email=email, first_name="Test", last_name="User", role=role,
    )


def auth(client, user, password="pass1234"):
    url = reverse("token_obtain")
    res = client.post(url, {"username": user.username, "password": password}, format="json")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")


def make_client_obj(name="Acme"):
    return Client.objects.create(name=name, industry="Tech", status="active")


# ── URL Parser Unit Tests ─────────────────────────────────────────────────────

class ParseUrlTests(APITestCase):
    """Unit tests for the URL parsing helper — no DB or HTTP needed."""

    def test_list_endpoint(self):
        # /api/candidates/ → model=candidates, no object id
        model, obj_id = _parse_url("/api/candidates/")
        self.assertEqual(model,  "candidates")
        self.assertEqual(obj_id, "")

    def test_detail_endpoint(self):
        # /api/candidates/5/ → model=candidates, id=5
        model, obj_id = _parse_url("/api/candidates/5/")
        self.assertEqual(model,  "candidates")
        self.assertEqual(obj_id, "5")

    def test_custom_action_endpoint(self):
        # /api/submittals/3/advance/ → id should be "3", not "advance"
        model, obj_id = _parse_url("/api/submittals/3/advance/")
        self.assertEqual(model,  "submittals")
        self.assertEqual(obj_id, "3")

    def test_non_numeric_segment_ignored(self):
        # /api/jobs/reorder-stages/ — third segment is not an id
        model, obj_id = _parse_url("/api/jobs/reorder-stages/")
        self.assertEqual(obj_id, "")


# ── Middleware Integration Tests ──────────────────────────────────────────────

class MiddlewareLoggingTests(APITestCase):

    def setUp(self):
        self.recruiter = make_user("recruiter@test.com", role=Role.RECRUITER)
        self.manager   = make_user("manager@test.com",   role=Role.ACCOUNT_MANAGER)
        auth(self.client, self.manager)

    def test_post_creates_activity_log(self):
        # Creating a client via POST should produce exactly one CREATE log entry
        payload = {"name": "New Corp", "industry": "Finance", "status": "active"}
        self.client.post(reverse("client-list"), payload, format="json")
        log = ActivityLog.objects.filter(model_name="clients", action="create")
        self.assertEqual(log.count(), 1)
        self.assertEqual(log.first().user, self.manager)

    def test_patch_creates_update_log(self):
        client_obj = make_client_obj()
        url = reverse("client-detail", args=[client_obj.id])
        self.client.patch(url, {"name": "Updated Corp"}, format="json")
        log = ActivityLog.objects.filter(model_name="clients", action="update")
        self.assertEqual(log.count(), 1)

    def test_delete_creates_delete_log(self):
        client_obj = make_client_obj()
        url = reverse("client-detail", args=[client_obj.id])
        self.client.delete(url)
        log = ActivityLog.objects.filter(model_name="clients", action="delete")
        self.assertEqual(log.count(), 1)
        self.assertEqual(log.first().object_id, str(client_obj.id))

    def test_get_does_not_create_log(self):
        # Read requests must never be logged
        self.client.get(reverse("client-list"))
        self.assertEqual(ActivityLog.objects.count(), 0)

    def test_failed_request_not_logged(self):
        # A 400 bad request must not produce a log entry
        self.client.post(reverse("client-list"), {}, format="json")
        self.assertEqual(ActivityLog.objects.filter(action="create").count(), 0)

    def test_token_endpoint_not_logged(self):
        # Auth endpoints are excluded from logging
        self.client.credentials()   # clear auth so the login POST runs clean
        self.client.post(
            reverse("token_obtain"),
            {"username": self.manager.username, "password": "pass1234"},
            format="json",
        )
        self.assertEqual(ActivityLog.objects.count(), 0)

    def test_log_records_correct_object_id(self):
        client_obj = make_client_obj()
        url = reverse("client-detail", args=[client_obj.id])
        self.client.patch(url, {"name": "X"}, format="json")
        log = ActivityLog.objects.first()
        self.assertEqual(log.object_id, str(client_obj.id))


# ── Activity Log API Tests ────────────────────────────────────────────────────

class ActivityLogAPITests(APITestCase):

    def setUp(self):
        self.manager   = make_user("manager@test.com",   role=Role.ACCOUNT_MANAGER)
        self.recruiter = make_user("recruiter@test.com", role=Role.RECRUITER)
        # Seed a few log entries directly
        ActivityLog.objects.create(
            user=self.manager, action="create", method="POST",
            endpoint="/api/clients/", model_name="clients",
            object_id="", status_code=201,
        )
        ActivityLog.objects.create(
            user=self.recruiter, action="delete", method="DELETE",
            endpoint="/api/candidates/3/", model_name="candidates",
            object_id="3", status_code=204,
        )

    def test_manager_can_list_logs(self):
        auth(self.client, self.manager)
        res = self.client.get(reverse("activity-list"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["results"]), 2)

    def test_recruiter_cannot_access_logs(self):
        # Activity log is manager-and-above only
        auth(self.client, self.recruiter)
        res = self.client.get(reverse("activity-list"))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_filter_by_model(self):
        auth(self.client, self.manager)
        res = self.client.get(reverse("activity-list"), {"model": "candidates"})
        self.assertEqual(len(res.data["results"]), 1)
        self.assertEqual(res.data["results"][0]["model_name"], "candidates")

    def test_filter_by_action(self):
        auth(self.client, self.manager)
        res = self.client.get(reverse("activity-list"), {"action": "delete"})
        self.assertEqual(len(res.data["results"]), 1)
        self.assertEqual(res.data["results"][0]["action"], "delete")

    def test_filter_by_user(self):
        auth(self.client, self.manager)
        res = self.client.get(reverse("activity-list"), {"user": self.recruiter.id})
        self.assertEqual(len(res.data["results"]), 1)

    def test_no_create_via_api(self):
        # The API must not expose a create endpoint — logs are middleware-only
        auth(self.client, self.manager)
        res = self.client.post(reverse("activity-list"), {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


# ── Audit Log Isolation Tests ─────────────────────────────────────────────────

class ActivityLogIsolationTests(APITestCase):
    """Team Leads see only pod activity; AM/CEO see all; Recruiters are blocked."""

    def setUp(self):
        self.team_lead = make_user("tl@iso.com", role=Role.TEAM_LEAD)
        self.rec_in_pod = make_user("rec_in@iso.com", role=Role.RECRUITER)
        self.rec_in_pod.reports_to = self.team_lead
        self.rec_in_pod.save()
        self.rec_out = make_user("rec_out@iso.com", role=Role.RECRUITER)
        self.am = make_user("am@iso.com", role=Role.ACCOUNT_MANAGER)

        ActivityLog.objects.create(
            user=self.rec_in_pod, action="create", method="POST",
            endpoint="/api/candidates/", model_name="candidates",
            object_id="", status_code=201,
        )
        ActivityLog.objects.create(
            user=self.rec_out, action="create", method="POST",
            endpoint="/api/candidates/", model_name="candidates",
            object_id="", status_code=201,
        )

    def test_team_lead_sees_pod_activity(self):
        auth(self.client, self.team_lead)
        res = self.client.get(reverse("activity-list"))
        self.assertEqual(res.status_code, 200)
        users = [r["user"] for r in res.data["results"]]
        self.assertIn(str(self.rec_in_pod), users)

    def test_team_lead_cannot_see_outside_pod_activity(self):
        auth(self.client, self.team_lead)
        res = self.client.get(reverse("activity-list"))
        users = [r["user"] for r in res.data["results"]]
        self.assertNotIn(str(self.rec_out), users)

    def test_am_sees_all_activity(self):
        auth(self.client, self.am)
        res = self.client.get(reverse("activity-list"))
        self.assertEqual(res.status_code, 200)
        users = [r["user"] for r in res.data["results"]]
        self.assertIn(str(self.rec_in_pod), users)
        self.assertIn(str(self.rec_out), users)

    def test_recruiter_blocked(self):
        auth(self.client, self.rec_out)
        res = self.client.get(reverse("activity-list"))
        self.assertEqual(res.status_code, 403)
