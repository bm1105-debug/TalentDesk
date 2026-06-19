from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from users.models import User, Role
from candidates.models import Candidate
from clients.models import Client
from jobs.models import Job, PipelineStage
from submittals.models import Submittal
from .models import Notification
from .utils import notify


def make_user(username, role=Role.RECRUITER):
    return User.objects.create_user(username=username, password="pass1234", role=role)


def auth(client, user):
    res = client.post(reverse("token_obtain"), {"username": user.username, "password": "pass1234"})
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")


def make_submittal(recruiter):
    client_obj = Client.objects.create(name="Acme", industry="Tech", status="active")
    manager = make_user("mgr_n", Role.VP)
    job = Job.objects.create(title="Dev", client=client_obj, status="open", created_by=manager)
    stage = PipelineStage.objects.create(job=job, name="Screening", order=0)
    candidate = Candidate.objects.create(
        first_name="Jane", last_name="Doe", email="jane_n@example.com", phone="9100000001"
    )
    submittal = Submittal.objects.create(candidate=candidate, job=job, submitted_by=recruiter)
    return submittal, stage, candidate


# ── Unit: notify helper ────────────────────────────────────────────────────────

class NotifyHelperTest(APITestCase):

    def test_creates_notification(self):
        user = make_user("rec_notify")
        notify(user, "Test message")
        self.assertEqual(Notification.objects.filter(recipient=user).count(), 1)

    def test_notify_none_recipient_is_safe(self):
        notify(None, "Should not crash")
        self.assertEqual(Notification.objects.count(), 0)


# ── API tests ──────────────────────────────────────────────────────────────────

class NotificationAPITest(APITestCase):

    def setUp(self):
        self.user = make_user("rec_api")
        self.other = make_user("rec_other2")
        auth(self.client, self.user)
        notify(self.user, "First",  )
        notify(self.user, "Second")
        notify(self.other, "Other user's notification")

    def test_list_returns_only_own_notifications(self):
        res = self.client.get(reverse("notification-list"))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 2)

    def test_unread_count(self):
        res = self.client.get(reverse("notification-unread-count"))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["count"], 2)

    def test_mark_all_read(self):
        self.client.post(reverse("notification-mark-all-read"))
        res = self.client.get(reverse("notification-unread-count"))
        self.assertEqual(res.data["count"], 0)

    def test_mark_one_read(self):
        n = Notification.objects.filter(recipient=self.user).first()
        res = self.client.patch(reverse("notification-mark-read", args=[n.id]))
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["is_read"])

    def test_cannot_mark_other_users_notification(self):
        n = Notification.objects.filter(recipient=self.other).first()
        res = self.client.patch(reverse("notification-mark-read", args=[n.id]))
        self.assertEqual(res.status_code, 404)

    def test_unauthenticated_rejected(self):
        self.client.credentials()
        res = self.client.get(reverse("notification-list"))
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


# ── Trigger: submittal advance creates notification ────────────────────────────

class SubmittalAdvanceNotificationTest(APITestCase):

    def setUp(self):
        self.recruiter = make_user("rec_adv")
        auth(self.client, self.recruiter)
        self.submittal, self.stage, self.candidate = make_submittal(self.recruiter)

    def test_advance_creates_notification_for_submitter(self):
        url = reverse("submittal-advance", args=[self.submittal.id])
        self.client.post(url, {"stage_id": self.stage.id, "notes": ""}, format="json")
        notifs = Notification.objects.filter(recipient=self.recruiter)
        self.assertEqual(notifs.count(), 1)
        self.assertIn("Screening", notifs.first().message)
        self.assertEqual(notifs.first().candidate, self.candidate)
