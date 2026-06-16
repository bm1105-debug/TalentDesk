# offers/tests.py

from datetime import date, timedelta
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from users.models import User, Role
from clients.models import Client
from candidates.models import Candidate
from jobs.models import Job, PipelineStage
from submittals.models import Submittal
from .models import Offer


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


def make_submittal(recruiter):
    """Creates the full chain: client → job (with pipeline) → candidate → submittal."""
    client_obj = Client.objects.create(name="Acme", industry="Tech", status="active")
    manager    = make_user("mgr@acme.com", role=Role.ACCOUNT_MANAGER)
    job = Job.objects.create(
        title="Engineer", client=client_obj, status="open", created_by=manager
    )
    # Build a default pipeline so accept() can find the terminal stage
    PipelineStage.objects.create(job=job, name="Screening", order=0)
    PipelineStage.objects.create(job=job, name="Interview",  order=1)
    PipelineStage.objects.create(job=job, name="Offer",      order=2)
    PipelineStage.objects.create(job=job, name="Placed",     order=3)

    candidate = Candidate.objects.create(
        first_name="Jane", last_name="Doe",
        email="jane@example.com", phone="9000000001",
    )
    return Submittal.objects.create(
        candidate=candidate, job=job, submitted_by=recruiter
    )


def make_offer(submittal, recruiter, **kwargs):
    defaults = {
        "salary": "75000.00",
        "offer_date": date.today(),
        "created_by": recruiter,
    }
    defaults.update(kwargs)
    return Offer.objects.create(submittal=submittal, **defaults)


LIST_URL  = "/api/offers/"
def detail_url(pk): return f"/api/offers/{pk}/"
def action_url(pk, act): return f"/api/offers/{pk}/{act}/"


# ── CRUD tests ────────────────────────────────────────────────────────────────

class OfferCreateTests(APITestCase):

    def setUp(self):
        self.recruiter = make_user("rec@test.com")
        auth(self.client, self.recruiter)
        self.submittal = make_submittal(self.recruiter)

    def test_create_offer(self):
        res = self.client.post(LIST_URL, {
            "submittal": self.submittal.pk,
            "salary": "80000.00",
            "offer_date": str(date.today()),
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["status"], "pending")
        self.assertEqual(res.data["candidate_name"], "Jane Doe")

    def test_cannot_create_second_pending_offer(self):
        make_offer(self.submittal, self.recruiter)
        res = self.client.post(LIST_URL, {
            "submittal": self.submittal.pk,
            "salary": "90000.00",
            "offer_date": str(date.today()),
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_create_offer_on_placed_submittal(self):
        self.submittal.status = "placed"
        self.submittal.save(update_fields=["status", "updated_at"])
        res = self.client.post(LIST_URL, {
            "submittal": self.submittal.pk,
            "salary": "80000.00",
            "offer_date": str(date.today()),
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthenticated_blocked(self):
        self.client.credentials()
        res = self.client.post(LIST_URL, {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class OfferListFilterTests(APITestCase):

    def setUp(self):
        self.recruiter = make_user("rec2@test.com")
        auth(self.client, self.recruiter)
        self.submittal = make_submittal(self.recruiter)
        self.offer = make_offer(self.submittal, self.recruiter)

    def test_list_all(self):
        res = self.client.get(LIST_URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 1)

    def test_filter_by_submittal(self):
        res = self.client.get(LIST_URL, {"submittal": self.submittal.pk})
        self.assertEqual(res.data["count"], 1)

    def test_filter_by_status(self):
        res = self.client.get(LIST_URL, {"status": "pending"})
        self.assertEqual(res.data["count"], 1)
        res2 = self.client.get(LIST_URL, {"status": "accepted"})
        self.assertEqual(res2.data["count"], 0)


# ── Status transition tests ───────────────────────────────────────────────────

class OfferAcceptTests(APITestCase):

    def setUp(self):
        self.recruiter = make_user("rec3@test.com")
        auth(self.client, self.recruiter)
        self.submittal = make_submittal(self.recruiter)
        self.offer = make_offer(self.submittal, self.recruiter)

    def test_accept_sets_offer_accepted(self):
        res = self.client.post(action_url(self.offer.pk, "accept"), {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "accepted")

    def test_accept_places_submittal(self):
        self.client.post(action_url(self.offer.pk, "accept"), {}, format="json")
        self.submittal.refresh_from_db()
        self.assertEqual(self.submittal.status, "placed")

    def test_accept_sets_placed_pipeline_stage(self):
        self.client.post(action_url(self.offer.pk, "accept"), {}, format="json")
        self.submittal.refresh_from_db()
        self.assertEqual(self.submittal.current_stage.name, "Placed")

    def test_cannot_accept_already_accepted(self):
        self.client.post(action_url(self.offer.pk, "accept"), {}, format="json")
        res = self.client.post(action_url(self.offer.pk, "accept"), {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


class OfferDeclineTests(APITestCase):

    def setUp(self):
        self.recruiter = make_user("rec4@test.com")
        auth(self.client, self.recruiter)
        self.submittal = make_submittal(self.recruiter)
        self.offer = make_offer(self.submittal, self.recruiter)

    def test_decline_sets_status(self):
        res = self.client.post(action_url(self.offer.pk, "decline"),
                               {"notes": "Salary too low"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "declined")

    def test_decline_does_not_change_submittal_status(self):
        self.client.post(action_url(self.offer.pk, "decline"), {}, format="json")
        self.submittal.refresh_from_db()
        self.assertEqual(self.submittal.status, "active")

    def test_cannot_decline_non_pending(self):
        self.offer.status = Offer.Status.WITHDRAWN
        self.offer.save(update_fields=["status", "updated_at"])
        res = self.client.post(action_url(self.offer.pk, "decline"), {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


class OfferWithdrawTests(APITestCase):

    def setUp(self):
        self.recruiter = make_user("rec5@test.com")
        auth(self.client, self.recruiter)
        self.submittal = make_submittal(self.recruiter)
        self.offer = make_offer(self.submittal, self.recruiter)

    def test_withdraw_sets_status(self):
        res = self.client.post(action_url(self.offer.pk, "withdraw"),
                               {"notes": "Client withdrew budget"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "withdrawn")

    def test_withdraw_leaves_submittal_active(self):
        self.client.post(action_url(self.offer.pk, "withdraw"), {}, format="json")
        self.submittal.refresh_from_db()
        self.assertEqual(self.submittal.status, "active")


# ── Permission tests ──────────────────────────────────────────────────────────

class OfferPermissionTests(APITestCase):

    def setUp(self):
        self.recruiter = make_user("rec6@test.com")
        self.manager   = make_user("mgr6@test.com", role=Role.ACCOUNT_MANAGER)
        self.submittal = make_submittal(self.recruiter)
        self.offer     = make_offer(self.submittal, self.recruiter)

    def test_recruiter_cannot_delete(self):
        auth(self.client, self.recruiter)
        res = self.client.delete(detail_url(self.offer.pk))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_can_delete(self):
        auth(self.client, self.manager)
        res = self.client.delete(detail_url(self.offer.pk))
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
