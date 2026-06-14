# interviews/tests.py
# What this file does: tests interview CRUD, status transitions, filters,
# note-appending behaviour, and permission enforcement.

from datetime import timedelta
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from users.models import User, Role
from clients.models import Client
from candidates.models import Candidate
from jobs.models import Job, PipelineStage
from submittals.models import Submittal
from .models import Interview


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
    """Creates the full chain: client → job → candidate → submittal."""
    client_obj = Client.objects.create(name="Acme", industry="Tech", status="active")
    manager    = make_user("mgr@test.com", role=Role.ACCOUNT_MANAGER)
    job        = Job.objects.create(
        title="Engineer", client=client_obj, status="open", created_by=manager
    )
    PipelineStage.objects.create(job=job, name="Screening", order=0)
    candidate = Candidate.objects.create(
        first_name="Jane", last_name="Doe",
        email="jane@example.com", phone="9000000001",
    )
    return Submittal.objects.create(
        candidate=candidate, job=job, submitted_by=recruiter
    )


def future(days=1):
    """Returns a timezone-aware datetime N days in the future."""
    return timezone.now() + timedelta(days=days)


def past(days=1):
    """Returns a timezone-aware datetime N days in the past."""
    return timezone.now() - timedelta(days=days)


URL = reverse("interview-list")


# ── Create Tests ──────────────────────────────────────────────────────────────

class InterviewCreateTests(APITestCase):
    """What this class does: verifies interviews can be created with valid data
    and that invalid inputs (past dates, inactive submittals) are rejected."""

    def setUp(self):
        self.recruiter = make_user("rec@test.com")
        auth(self.client, self.recruiter)
        self.submittal = make_submittal(self.recruiter)

    def test_create_interview(self):
        payload = {
            "submittal":       self.submittal.id,
            "interview_type":  "video",
            "scheduled_at":    future(2).isoformat(),
            "duration_minutes": 45,
            "meeting_link":    "https://meet.google.com/abc",
        }
        res = self.client.post(URL, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["interview_type"], "video")
        self.assertEqual(res.data["status"], "scheduled")

    def test_created_by_auto_set(self):
        payload = {
            "submittal":      self.submittal.id,
            "interview_type": "phone",
            "scheduled_at":   future(1).isoformat(),
        }
        res = self.client.post(URL, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        interview = Interview.objects.get(id=res.data["id"])
        self.assertEqual(interview.created_by, self.recruiter)

    def test_past_scheduled_at_rejected(self):
        # Interviews cannot be scheduled in the past
        payload = {
            "submittal":      self.submittal.id,
            "interview_type": "phone",
            "scheduled_at":   past(1).isoformat(),
        }
        res = self.client.post(URL, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_inactive_submittal_rejected(self):
        # Cannot schedule an interview if the submittal is already rejected/placed
        self.submittal.status = "rejected"
        self.submittal.save()
        payload = {
            "submittal":      self.submittal.id,
            "interview_type": "phone",
            "scheduled_at":   future(1).isoformat(),
        }
        res = self.client.post(URL, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthenticated_rejected(self):
        self.client.credentials()
        res = self.client.post(URL, {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


# ── Read and Filter Tests ─────────────────────────────────────────────────────

class InterviewFilterTests(APITestCase):
    """What this class does: verifies the ?submittal, ?status, and ?type
    query params correctly narrow the results list."""

    def setUp(self):
        self.recruiter = make_user("rec@test.com")
        auth(self.client, self.recruiter)
        self.submittal = make_submittal(self.recruiter)

        self.i1 = Interview.objects.create(
            submittal=self.submittal, interview_type="phone",
            scheduled_at=future(1), status="scheduled",
            created_by=self.recruiter,
        )
        self.i2 = Interview.objects.create(
            submittal=self.submittal, interview_type="video",
            scheduled_at=future(2), status="completed",
            created_by=self.recruiter,
        )

    def test_filter_by_submittal(self):
        res = self.client.get(URL, {"submittal": self.submittal.id})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["results"]), 2)

    def test_filter_by_status(self):
        res = self.client.get(URL, {"status": "completed"})
        self.assertEqual(len(res.data["results"]), 1)
        self.assertEqual(res.data["results"][0]["id"], self.i2.id)

    def test_filter_by_type(self):
        res = self.client.get(URL, {"type": "phone"})
        self.assertEqual(len(res.data["results"]), 1)
        self.assertEqual(res.data["results"][0]["id"], self.i1.id)

    def test_result_has_candidate_and_job_names(self):
        # Verify denormalised display fields are present
        res = self.client.get(URL, {"submittal": self.submittal.id})
        result = res.data["results"][0]
        self.assertIn("candidate_name", result)
        self.assertIn("job_title",      result)
        self.assertEqual(result["candidate_name"], "Jane Doe")
        self.assertEqual(result["job_title"],      "Engineer")


# ── Update Tests ──────────────────────────────────────────────────────────────

class InterviewUpdateTests(APITestCase):
    """What this class does: verifies PATCH updates and that rescheduling
    to a past date is still rejected on update."""

    def setUp(self):
        self.recruiter = make_user("rec@test.com")
        auth(self.client, self.recruiter)
        self.submittal = make_submittal(self.recruiter)
        self.interview = Interview.objects.create(
            submittal=self.submittal, interview_type="phone",
            scheduled_at=future(1), created_by=self.recruiter,
        )

    def test_patch_updates_meeting_link(self):
        url = reverse("interview-detail", args=[self.interview.id])
        res = self.client.patch(url, {"meeting_link": "https://zoom.us/j/123"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["meeting_link"], "https://zoom.us/j/123")

    def test_reschedule_to_past_rejected(self):
        url = reverse("interview-detail", args=[self.interview.id])
        res = self.client.patch(url, {"scheduled_at": past(1).isoformat()}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


# ── Update Status Tests ───────────────────────────────────────────────────────

class InterviewUpdateStatusTests(APITestCase):
    """What this class does: verifies the update-status custom action transitions
    status correctly and appends notes without overwriting existing ones."""

    def setUp(self):
        self.recruiter = make_user("rec@test.com")
        auth(self.client, self.recruiter)
        self.submittal = make_submittal(self.recruiter)
        self.interview = Interview.objects.create(
            submittal=self.submittal, interview_type="technical",
            scheduled_at=future(1), created_by=self.recruiter,
            notes="Initial setup notes.",
        )

    def _url(self):
        return reverse("interview-update-status", args=[self.interview.id])

    def test_mark_completed(self):
        res = self.client.post(self._url(), {"status": "completed", "notes": "Strong performance."}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.interview.refresh_from_db()
        self.assertEqual(self.interview.status, "completed")

    def test_notes_are_appended_not_replaced(self):
        # Existing notes must be preserved when new notes are added
        self.client.post(self._url(), {"status": "completed", "notes": "Feedback round 1."}, format="json")
        self.interview.refresh_from_db()
        self.assertIn("Initial setup notes.", self.interview.notes)
        self.assertIn("Feedback round 1.",    self.interview.notes)

    def test_mark_no_show(self):
        res = self.client.post(self._url(), {"status": "no_show"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.interview.refresh_from_db()
        self.assertEqual(self.interview.status, "no_show")

    def test_invalid_status_rejected(self):
        res = self.client.post(self._url(), {"status": "nonsense"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


# ── Permission Tests ──────────────────────────────────────────────────────────

class InterviewPermissionTests(APITestCase):
    """What this class does: verifies delete is manager-only and
    recruiters can still create and read."""

    def setUp(self):
        self.recruiter = make_user("rec@test.com",  role=Role.RECRUITER)
        self.manager   = make_user("mgr2@test.com", role=Role.ACCOUNT_MANAGER)
        submittal      = make_submittal(self.recruiter)
        self.interview = Interview.objects.create(
            submittal=submittal, interview_type="phone",
            scheduled_at=future(1), created_by=self.recruiter,
        )

    def test_recruiter_cannot_delete(self):
        auth(self.client, self.recruiter)
        url = reverse("interview-detail", args=[self.interview.id])
        res = self.client.delete(url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_can_delete(self):
        auth(self.client, self.manager)
        url = reverse("interview-detail", args=[self.interview.id])
        res = self.client.delete(url)
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
