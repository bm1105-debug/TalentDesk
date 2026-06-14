from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from users.models import User, Role
from clients.models import Client
from .models import Job, PipelineStage, DEFAULT_PIPELINE


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_user(email, role=Role.RECRUITER, password="pass1234"):
    username = email.split("@")[0]
    return User.objects.create_user(
        username=username, password=password,
        email=email, first_name="Test", last_name="User", role=role,
    )


def auth(client, user, password="pass1234"):
    """Obtain JWT and attach to the test client."""
    url = reverse("token_obtain")
    res = client.post(url, {"username": user.username, "password": password}, format="json")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")


def make_client(name="Acme Corp"):
    return Client.objects.create(name=name, industry="Tech", status="active")


def make_job(client, created_by, **kwargs):
    """Create a job directly in the DB, bypassing the serializer pipeline logic."""
    defaults = {
        "title":    "Backend Engineer",
        "status":   "open",
        "priority": "medium",
    }
    defaults.update(kwargs)
    return Job.objects.create(client=client, created_by=created_by, **defaults)


# ── Pipeline Auto-Creation Tests ──────────────────────────────────────────────

class JobPipelineTests(APITestCase):

    def setUp(self):
        self.manager = make_user("manager@test.com", role=Role.ACCOUNT_MANAGER)
        auth(self.client, self.manager)
        self.acme = make_client()
        self.url  = reverse("job-list")

    def test_default_pipeline_created_on_job_create(self):
        # When no pipeline_stages sent, DEFAULT_PIPELINE stages should be created
        payload = {"title": "Data Engineer", "client": self.acme.id}
        res = self.client.post(self.url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(res.data["stages"]), len(DEFAULT_PIPELINE))
        # Stages should be in order
        names = [s["name"] for s in res.data["stages"]]
        self.assertEqual(names, DEFAULT_PIPELINE)

    def test_custom_pipeline_overrides_default(self):
        # Caller can supply their own stage list at creation time
        custom = ["Phone Screen", "On-site", "Offer"]
        payload = {
            "title": "Designer",
            "client": self.acme.id,
            "pipeline_stages": custom,
        }
        res = self.client.post(self.url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        names = [s["name"] for s in res.data["stages"]]
        self.assertEqual(names, custom)

    def test_reorder_stages(self):
        # Create a job first, then swap stage order via the custom action
        payload = {"title": "PM Role", "client": self.acme.id}
        create_res = self.client.post(self.url, payload, format="json")
        job_id = create_res.data["id"]
        stages = create_res.data["stages"]   # ordered 0..4

        # Swap first and second stage
        reorder_payload = {
            "stages": [
                {"id": stages[0]["id"], "order": 1},
                {"id": stages[1]["id"], "order": 0},
            ]
        }
        url = reverse("job-reorder-stages", args=[job_id])
        res = self.client.post(url, reorder_payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_reorder_stages_rejects_foreign_stage_id(self):
        # Stage IDs from a different job must be rejected
        job1_res = self.client.post(self.url, {"title": "Job 1", "client": self.acme.id}, format="json")
        job2_res = self.client.post(self.url, {"title": "Job 2", "client": self.acme.id}, format="json")

        job1_stage_id = job1_res.data["stages"][0]["id"]
        url = reverse("job-reorder-stages", args=[job2_res.data["id"]])
        res = self.client.post(url, {"stages": [{"id": job1_stage_id, "order": 0}]}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


# ── Job CRUD Tests ────────────────────────────────────────────────────────────

class JobCRUDTests(APITestCase):

    def setUp(self):
        self.manager   = make_user("manager@test.com",   role=Role.ACCOUNT_MANAGER)
        self.recruiter = make_user("recruiter@test.com", role=Role.RECRUITER)
        self.acme      = make_client()
        self.url       = reverse("job-list")

    def test_manager_can_create_job(self):
        auth(self.client, self.manager)
        payload = {"title": "DevOps Engineer", "client": self.acme.id, "openings": 2}
        res = self.client.post(self.url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["openings"], 2)
        # created_by should be the logged-in manager
        self.assertIn("manager", res.data["created_by"])

    def test_recruiter_cannot_create_job(self):
        # Recruiters are read-only — job creation is a manager responsibility
        auth(self.client, self.recruiter)
        payload = {"title": "QA Engineer", "client": self.acme.id}
        res = self.client.post(self.url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_recruiter_can_list_jobs(self):
        auth(self.client, self.manager)
        self.client.post(self.url, {"title": "Job A", "client": self.acme.id}, format="json")

        auth(self.client, self.recruiter)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["results"]), 1)

    def test_manager_can_update_job(self):
        auth(self.client, self.manager)
        create_res = self.client.post(self.url, {"title": "Old Title", "client": self.acme.id}, format="json")
        url = reverse("job-detail", args=[create_res.data["id"]])
        res = self.client.patch(url, {"title": "New Title"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["title"], "New Title")

    def test_manager_can_delete_job(self):
        auth(self.client, self.manager)
        create_res = self.client.post(self.url, {"title": "To Delete", "client": self.acme.id}, format="json")
        url = reverse("job-detail", args=[create_res.data["id"]])
        res = self.client.delete(url)
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

    def test_unauthenticated_rejected(self):
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


# ── Filter Tests ──────────────────────────────────────────────────────────────

class JobFilterTests(APITestCase):

    def setUp(self):
        self.manager   = make_user("manager@test.com",   role=Role.ACCOUNT_MANAGER)
        self.recruiter = make_user("recruiter@test.com", role=Role.RECRUITER)
        self.acme      = make_client("Acme")
        self.beta      = make_client("Beta Inc")
        auth(self.client, self.manager)

        # Create two jobs with different attributes for filter assertions
        self.j1 = make_job(self.acme, self.manager, title="Python Dev", status="open",   priority="urgent")
        self.j2 = make_job(self.beta, self.manager, title="React Dev",  status="filled", priority="low")
        self.j1.assigned_to.add(self.recruiter)

    def test_filter_by_status(self):
        auth(self.client, self.recruiter)
        res = self.client.get(reverse("job-list"), {"status": "open"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["results"]), 1)
        self.assertEqual(res.data["results"][0]["title"], "Python Dev")

    def test_filter_by_priority(self):
        auth(self.client, self.recruiter)
        res = self.client.get(reverse("job-list"), {"priority": "urgent"})
        self.assertEqual(len(res.data["results"]), 1)

    def test_filter_by_client(self):
        auth(self.client, self.recruiter)
        res = self.client.get(reverse("job-list"), {"client": self.acme.id})
        self.assertEqual(len(res.data["results"]), 1)
        self.assertEqual(res.data["results"][0]["title"], "Python Dev")

    def test_filter_assigned_to_me(self):
        # Recruiter is only assigned to j1 — should only see that one
        auth(self.client, self.recruiter)
        res = self.client.get(reverse("job-list"), {"assigned_to_me": "true"})
        self.assertEqual(len(res.data["results"]), 1)
        self.assertEqual(res.data["results"][0]["title"], "Python Dev")

    def test_search_by_title(self):
        auth(self.client, self.recruiter)
        res = self.client.get(reverse("job-list"), {"search": "React"})
        self.assertEqual(len(res.data["results"]), 1)
        self.assertEqual(res.data["results"][0]["title"], "React Dev")


# ── Assign / Unassign Tests ───────────────────────────────────────────────────

class JobAssignTests(APITestCase):

    def setUp(self):
        self.manager   = make_user("manager@test.com",   role=Role.ACCOUNT_MANAGER)
        self.recruiter = make_user("recruiter@test.com", role=Role.RECRUITER)
        self.acme      = make_client()
        auth(self.client, self.manager)
        self.job = make_job(self.acme, self.manager)

    def test_assign_recruiter(self):
        url = reverse("job-assign", args=[self.job.id])
        res = self.client.post(url, {"user_id": self.recruiter.id}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Recruiter should appear in assigned_to_names
        self.assertIn(str(self.recruiter), res.data["assigned_to_names"])

    def test_unassign_recruiter(self):
        self.job.assigned_to.add(self.recruiter)
        url = reverse("job-unassign", args=[self.job.id])
        res = self.client.post(url, {"user_id": self.recruiter.id}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["assigned_to_names"]), 0)

    def test_assign_nonexistent_user_returns_404(self):
        url = reverse("job-assign", args=[self.job.id])
        res = self.client.post(url, {"user_id": 99999}, format="json")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
