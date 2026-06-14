# cvgen/tests.py
# What this file does: tests the PDF and DOCX download endpoints.
# Verifies correct content-type, content-disposition filename, auth
# enforcement, 404 on missing candidate, and that files are non-empty.

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from users.models import User, Role
from candidates.models import Candidate, SkillTag


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


def make_candidate(with_skills=False, with_notes=False):
    c = Candidate.objects.create(
        first_name="Jane", last_name="Doe",
        email="jane@example.com", phone="9000000001",
        current_title="Python Developer", current_company="Acme Corp",
        location="London", linkedin_url="https://linkedin.com/in/janedoe",
        notes="Experienced developer with strong backend skills." if with_notes else "",
    )
    if with_skills:
        skill = SkillTag.objects.create(name="Python")
        c.skills.add(skill)
    return c


# ── PDF Tests ─────────────────────────────────────────────────────────────────

class CandidatePDFTests(APITestCase):
    """What this class does: verifies the PDF endpoint returns a valid
    downloadable PDF with correct headers."""

    def setUp(self):
        self.user      = make_user("rec@test.com")
        self.candidate = make_candidate(with_skills=True, with_notes=True)
        auth(self.client, self.user)

    def _url(self, pk=None):
        return reverse("candidate-cv-pdf", args=[pk or self.candidate.pk])

    def test_returns_200(self):
        res = self.client.get(self._url())
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_content_type_is_pdf(self):
        res = self.client.get(self._url())
        self.assertEqual(res["Content-Type"], "application/pdf")

    def test_content_disposition_filename(self):
        res = self.client.get(self._url())
        self.assertIn("Jane_Doe_CV.pdf", res["Content-Disposition"])

    def test_response_body_is_non_empty(self):
        res = self.client.get(self._url())
        # A valid PDF always starts with the %PDF- magic bytes
        self.assertTrue(res.content.startswith(b"%PDF-"))

    def test_unauthenticated_rejected(self):
        self.client.credentials()
        res = self.client.get(self._url())
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_missing_candidate_returns_404(self):
        res = self.client.get(self._url(pk=99999))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_minimal_candidate_no_skills_no_notes(self):
        # Candidate with only required fields — template must not crash
        bare = Candidate.objects.create(
            first_name="John", last_name="Plain",
            email="john@example.com", phone="9000000002",
        )
        res = self.client.get(self._url(pk=bare.pk))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.content.startswith(b"%PDF-"))


# ── DOCX Tests ────────────────────────────────────────────────────────────────

class CandidateDOCXTests(APITestCase):
    """What this class does: verifies the DOCX endpoint returns a valid
    Word document with correct headers."""

    def setUp(self):
        self.user      = make_user("rec@test.com")
        self.candidate = make_candidate(with_skills=True, with_notes=True)
        auth(self.client, self.user)

    def _url(self, pk=None):
        return reverse("candidate-cv-docx", args=[pk or self.candidate.pk])

    def test_returns_200(self):
        res = self.client.get(self._url())
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_content_type_is_docx(self):
        res = self.client.get(self._url())
        self.assertIn(
            "wordprocessingml.document",
            res["Content-Type"],
        )

    def test_content_disposition_filename(self):
        res = self.client.get(self._url())
        self.assertIn("Jane_Doe_CV.docx", res["Content-Disposition"])

    def test_response_body_is_non_empty(self):
        res = self.client.get(self._url())
        # DOCX files are ZIP archives — magic bytes are PK\x03\x04
        self.assertTrue(res.content[:4] == b"PK\x03\x04")

    def test_unauthenticated_rejected(self):
        self.client.credentials()
        res = self.client.get(self._url())
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_missing_candidate_returns_404(self):
        res = self.client.get(self._url(pk=99999))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_minimal_candidate_no_skills_no_notes(self):
        bare = Candidate.objects.create(
            first_name="John", last_name="Plain",
            email="john@example.com", phone="9000000002",
        )
        res = self.client.get(self._url(pk=bare.pk))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.content[:4] == b"PK\x03\x04")
