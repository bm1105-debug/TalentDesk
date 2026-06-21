# communications/tests.py
# Tests for AI email generation and history.

from unittest.mock import patch

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from users.models import User, Role
from .models import GeneratedEmail


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


_MOCK_SINGLE_RESPONSE = (
    "Subject: Interview Invitation — Backend Engineer\n\n"
    "Email: Hi Jane Doe, we'd like to invite you for an interview "
    "for the Backend Engineer role on Monday at 11 AM via Teams."
)


class GenerateEmailTests(APITestCase):
    """Tests for POST /api/communications/ai-generate/ — single and bulk modes."""

    def setUp(self):
        self.recruiter = make_user("rec@test.com", role=Role.RECRUITER)
        auth(self.client, self.recruiter)

    def _payload(self, **kwargs):
        base = {
            "mode": "single",
            "purpose": "Interview Scheduling",
            "recipient": "Jane Doe",
            "keypoints": "Monday 11 AM, Teams link",
            "tone": "Professional",
            "length": "Standard",
        }
        base.update(kwargs)
        return base

    @patch("communications.views._call_groq", return_value=_MOCK_SINGLE_RESPONSE)
    def test_single_email_returns_200(self, _mock):
        res = self.client.post(reverse("ai-generate-email"), self._payload(), format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["mode"], "single")
        self.assertIn("Interview", res.data["subject"])
        self.assertNotEqual(res.data["body"], "")

    @patch("communications.views._call_groq", return_value=_MOCK_SINGLE_RESPONSE)
    def test_single_email_saves_to_history(self, _mock):
        self.client.post(reverse("ai-generate-email"), self._payload(), format="json")
        self.assertEqual(GeneratedEmail.objects.filter(user=self.recruiter).count(), 1)
        record = GeneratedEmail.objects.get(user=self.recruiter)
        self.assertEqual(record.mode, "single")
        self.assertEqual(record.purpose, "Interview Scheduling")

    @patch("communications.views._call_groq", return_value=_MOCK_SINGLE_RESPONSE)
    def test_single_email_with_refinement_passes_context(self, mock_groq):
        payload = self._payload(
            refine_instruction="Make it shorter",
            previous_email="Subject: Old\n\nEmail: Old body",
        )
        res = self.client.post(reverse("ai-generate-email"), payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        args = mock_groq.call_args[0][0]
        roles = [m["role"] for m in args]
        self.assertIn("assistant", roles)

    @patch("communications.views._call_groq", return_value=_MOCK_SINGLE_RESPONSE)
    def test_bulk_email_generates_per_recipient(self, _mock):
        payload = {
            "mode": "bulk",
            "purpose": "Interview Scheduling",
            "keypoints": "Monday 11 AM",
            "tone": "Professional",
            "length": "Concise",
            "recipients": ["Alice Smith", "Bob Jones"],
        }
        res = self.client.post(reverse("ai-generate-email"), payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["mode"], "bulk")
        self.assertEqual(len(res.data["bulk_results"]), 2)

    @patch("communications.views._call_groq", return_value=_MOCK_SINGLE_RESPONSE)
    def test_history_capped_at_10(self, _mock):
        for i in range(11):
            self.client.post(reverse("ai-generate-email"), self._payload(purpose=f"Email {i}"), format="json")
        self.assertEqual(GeneratedEmail.objects.filter(user=self.recruiter).count(), 10)

    @patch("communications.views._call_groq", return_value=_MOCK_SINGLE_RESPONSE)
    def test_history_returns_last_10(self, _mock):
        for i in range(5):
            self.client.post(reverse("ai-generate-email"), self._payload(purpose=f"Email {i}"), format="json")
        res = self.client.get(reverse("ai-email-history"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 5)

    @patch("communications.views._call_groq", return_value=_MOCK_SINGLE_RESPONSE)
    def test_history_is_user_scoped(self, _mock):
        self.client.post(reverse("ai-generate-email"), self._payload(), format="json")
        other = make_user("other@test.com", role=Role.RECRUITER)
        auth(self.client, other)
        res = self.client.get(reverse("ai-email-history"))
        self.assertEqual(len(res.data), 0)

    def test_missing_required_fields_rejected(self):
        res = self.client.post(reverse("ai-generate-email"), {"mode": "single"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthenticated_rejected(self):
        self.client.credentials()
        res = self.client.post(reverse("ai-generate-email"), self._payload(), format="json")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    @patch("communications.views._call_groq", side_effect=Exception("Groq unreachable"))
    def test_groq_error_returns_502(self, _mock):
        res = self.client.post(reverse("ai-generate-email"), self._payload(), format="json")
        self.assertEqual(res.status_code, status.HTTP_502_BAD_GATEWAY)

    def test_bulk_requires_recipients(self):
        payload = {
            "mode": "bulk", "purpose": "Interview", "keypoints": "Monday",
            "tone": "Professional", "length": "Concise", "recipients": [],
        }
        res = self.client.post(reverse("ai-generate-email"), payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("communications.views._call_groq", return_value=_MOCK_SINGLE_RESPONSE)
    def test_save_history_false_skips_db_record(self, _mock):
        payload = self._payload(save_history=False)
        res = self.client.post(reverse("ai-generate-email"), payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(GeneratedEmail.objects.filter(user=self.recruiter).count(), 0)


class EmailHistoryClearTests(APITestCase):
    """Tests for DELETE /api/communications/ai-history/"""

    def setUp(self):
        self.recruiter = make_user("rec@test.com", role=Role.RECRUITER)
        auth(self.client, self.recruiter)

    @patch("communications.views._call_groq", return_value=_MOCK_SINGLE_RESPONSE)
    def test_delete_clears_history(self, _mock):
        for i in range(3):
            self.client.post(reverse("ai-generate-email"), {
                "mode": "single", "purpose": f"Email {i}", "recipient": "Jane",
                "keypoints": "test", "tone": "Professional", "length": "Concise",
            }, format="json")
        self.assertEqual(GeneratedEmail.objects.filter(user=self.recruiter).count(), 3)
        res = self.client.delete(reverse("ai-email-history"))
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(GeneratedEmail.objects.filter(user=self.recruiter).count(), 0)

    def test_delete_only_affects_own_history(self):
        other = make_user("other@test.com", role=Role.RECRUITER)
        GeneratedEmail.objects.create(
            user=other, mode="single", purpose="Other", tone="Professional",
            length="Standard", recipient="Bob", subject="Hi", body="Body",
        )
        res = self.client.delete(reverse("ai-email-history"))
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(GeneratedEmail.objects.filter(user=other).count(), 1)
