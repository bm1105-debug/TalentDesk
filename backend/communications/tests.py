# communications/tests.py
# What this file does: tests email template CRUD, template rendering/preview,
# the send endpoint (using Django's in-memory email backend so no real SMTP
# is needed), audit log access, and permission enforcement.

from django.urls import reverse
from django.core import mail
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from users.models import User, Role
from candidates.models import Candidate
from jobs.models import Job, PipelineStage
from clients.models import Client
from .models import EmailTemplate, SentEmail


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


def make_template(created_by, name="Intro Email", template_type="intro"):
    return EmailTemplate.objects.create(
        name=name,
        template_type=template_type,
        subject="Hello {{ candidate_name }}",
        body="Dear {{ candidate_name }},\n\nWe'd like to discuss {{ job_title }} at {{ company_name }}.",
        available_variables="candidate_name, job_title, company_name",
        created_by=created_by,
    )


# Use Django's in-memory backend so tests never hit real SMTP
@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class EmailTemplateTests(APITestCase):
    """What this class does: verifies managers can create/edit templates
    and recruiters can only read them."""

    def setUp(self):
        self.manager   = make_user("mgr@test.com",  role=Role.VP)
        self.recruiter = make_user("rec@test.com",  role=Role.RECRUITER)

    def test_manager_can_create_template(self):
        auth(self.client, self.manager)
        payload = {
            "name":          "Interview Invite",
            "template_type": "interview",
            "subject":       "Interview for {{ job_title }}",
            "body":          "Hi {{ candidate_name }}, your interview is on {{ interview_date }}.",
        }
        res = self.client.post(reverse("emailtemplate-list"), payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["name"], "Interview Invite")

    def test_created_by_auto_set(self):
        auth(self.client, self.manager)
        payload = {
            "name": "Test Template", "template_type": "custom",
            "subject": "Test", "body": "Test body",
        }
        res = self.client.post(reverse("emailtemplate-list"), payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        template = EmailTemplate.objects.get(id=res.data["id"])
        self.assertEqual(template.created_by, self.manager)

    def test_recruiter_cannot_create_template(self):
        auth(self.client, self.recruiter)
        payload = {
            "name": "Hack Template", "template_type": "custom",
            "subject": "Test", "body": "Test",
        }
        res = self.client.post(reverse("emailtemplate-list"), payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_recruiter_can_list_templates(self):
        make_template(self.manager)
        auth(self.client, self.recruiter)
        res = self.client.get(reverse("emailtemplate-list"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["results"]), 1)

    def test_manager_can_delete_template(self):
        template = make_template(self.manager)
        auth(self.client, self.manager)
        res = self.client.delete(reverse("emailtemplate-detail", args=[template.id]))
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

    def test_unauthenticated_rejected(self):
        res = self.client.get(reverse("emailtemplate-list"))
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class PreviewEmailTests(APITestCase):
    """What this class does: verifies the preview endpoint renders
    {{ variables }} correctly without sending anything."""

    def setUp(self):
        self.manager  = make_user("mgr@test.com", role=Role.VP)
        self.recruiter = make_user("rec@test.com", role=Role.RECRUITER)
        self.template  = make_template(self.manager)
        auth(self.client, self.recruiter)

    def test_preview_renders_variables(self):
        payload = {
            "template_id": self.template.id,
            "context": {
                "candidate_name": "Jane Doe",
                "job_title":      "Backend Engineer",
                "company_name":   "Acme Corp",
            },
        }
        res = self.client.post(reverse("communications-preview"), payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["subject"], "Hello Jane Doe")
        self.assertIn("Jane Doe",        res.data["body"])
        self.assertIn("Backend Engineer", res.data["body"])
        self.assertIn("Acme Corp",        res.data["body"])

    def test_preview_does_not_send_email(self):
        payload = {"template_id": self.template.id, "context": {"candidate_name": "Jane"}}
        self.client.post(reverse("communications-preview"), payload, format="json")
        # locmem backend stores sent emails in mail.outbox — must be empty
        self.assertEqual(len(mail.outbox), 0)

    def test_preview_missing_variables_renders_empty(self):
        # Django templates silently render missing variables as empty string
        payload = {"template_id": self.template.id, "context": {}}
        res = self.client.post(reverse("communications-preview"), payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # {{ candidate_name }} renders as "" — subject becomes "Hello "
        self.assertIn("Hello", res.data["subject"])

    def test_invalid_template_id_rejected(self):
        payload = {"template_id": 99999, "context": {}}
        res = self.client.post(reverse("communications-preview"), payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class SendEmailTests(APITestCase):
    """What this class does: verifies the send endpoint renders the template,
    dispatches via the locmem backend, and creates a SentEmail log entry."""

    def setUp(self):
        self.manager   = make_user("mgr@test.com",  role=Role.VP)
        self.recruiter = make_user("rec@test.com",  role=Role.RECRUITER)
        self.template  = make_template(self.manager)
        auth(self.client, self.recruiter)

    def _send(self, extra=None):
        payload = {
            "template_id": self.template.id,
            "to_email":    "candidate@example.com",
            "to_name":     "Jane Doe",
            "context": {
                "candidate_name": "Jane Doe",
                "job_title":      "Backend Engineer",
                "company_name":   "Acme Corp",
            },
        }
        if extra:
            payload.update(extra)
        return self.client.post(reverse("communications-send"), payload, format="json")

    def test_send_returns_200(self):
        res = self._send()
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "sent")

    def test_send_dispatches_email(self):
        self._send()
        # locmem backend stores sent emails in mail.outbox
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["candidate@example.com"])
        self.assertEqual(mail.outbox[0].subject, "Hello Jane Doe")

    def test_send_creates_log_entry(self):
        self._send()
        self.assertEqual(SentEmail.objects.count(), 1)
        log = SentEmail.objects.first()
        self.assertEqual(log.to_email,  "candidate@example.com")
        self.assertEqual(log.status,    "sent")
        self.assertEqual(log.sent_by,   self.recruiter)
        self.assertEqual(log.template,  self.template)

    def test_log_stores_rendered_content(self):
        # The log must store what was actually sent, not raw template syntax
        self._send()
        log = SentEmail.objects.first()
        self.assertEqual(log.subject, "Hello Jane Doe")
        self.assertIn("Jane Doe", log.body)

    def test_send_with_related_candidate(self):
        candidate = Candidate.objects.create(
            first_name="Jane", last_name="Doe",
            email="jane@example.com", phone="9000000001",
        )
        res = self._send({"related_candidate": candidate.id})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        log = SentEmail.objects.first()
        self.assertEqual(log.related_candidate, candidate)

    def test_recruiter_cannot_access_send_log(self):
        # Audit log is manager-only
        self._send()
        res = self.client.get(reverse("sentemail-list"))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_can_access_send_log(self):
        self._send()
        auth(self.client, self.manager)
        res = self.client.get(reverse("sentemail-list"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["results"]), 1)

    def test_unauthenticated_cannot_send(self):
        self.client.credentials()
        res = self._send()
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class SentEmailAuditTests(APITestCase):
    """What this class does: verifies the sent email log filters work
    and that no create/delete is exposed."""

    def setUp(self):
        self.manager  = make_user("mgr@test.com", role=Role.VP)
        auth(self.client, self.manager)
        self.template = make_template(self.manager)

        # Seed two log entries directly
        SentEmail.objects.create(
            template=self.template, to_email="a@example.com",
            subject="Email A", body="Body A",
            status="sent", sent_by=self.manager,
        )
        SentEmail.objects.create(
            template=self.template, to_email="b@example.com",
            subject="Email B", body="Body B",
            status="failed", sent_by=self.manager,
        )

    def test_filter_by_status(self):
        res = self.client.get(reverse("sentemail-list"), {"status": "failed"})
        self.assertEqual(len(res.data["results"]), 1)
        self.assertEqual(res.data["results"][0]["to_email"], "b@example.com")

    def test_no_create_via_api(self):
        res = self.client.post(reverse("sentemail-list"), {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
