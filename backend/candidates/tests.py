from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from users.models import User, Role
from .models import Candidate, SkillTag


# ── Helpers ──────────────────────────────────────────────────────────────────

def make_user(email, role=Role.RECRUITER, password="pass1234"):
    # username derived from email prefix to keep it unique and simple
    username = email.split("@")[0]
    user = User.objects.create_user(
        username=username, password=password,
        email=email, first_name="Test", last_name="User", role=role,
    )
    return user


def auth(client, user):
    """Log in and attach JWT to the test client."""
    url = reverse("token_obtain")
    res = client.post(url, {"username": user.username, "password": "pass1234"}, format="json")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")


def make_candidate(**kwargs):
    defaults = {
        "first_name": "Jane",
        "last_name":  "Doe",
        "email":      "jane@example.com",
        "phone":      "9000000001",
    }
    defaults.update(kwargs)
    return Candidate.objects.create(**defaults)


# ── SkillTag Tests ────────────────────────────────────────────────────────────

class SkillTagTests(APITestCase):

    def setUp(self):
        self.user = make_user("recruiter@test.com")
        auth(self.client, self.user)
        SkillTag.objects.create(name="python")
        SkillTag.objects.create(name="django")

    def test_list_skills(self):
        res = self.client.get(reverse("skill-list"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["results"]), 2)

    def test_search_skills(self):
        res = self.client.get(reverse("skill-list"), {"search": "py"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["results"]), 1)
        self.assertEqual(res.data["results"][0]["name"], "python")

    def test_skill_name_normalized_to_lowercase(self):
        # SkillTag.save() forces lowercase — "Python" and "python" must be the same row
        tag = SkillTag.objects.create(name="SQL")
        self.assertEqual(tag.name, "sql")


# ── Candidate CRUD Tests ──────────────────────────────────────────────────────

class CandidateCreateTests(APITestCase):

    def setUp(self):
        self.recruiter = make_user("recruiter@test.com")
        auth(self.client, self.recruiter)
        self.url = reverse("candidate-list")

    def test_create_candidate(self):
        payload = {
            "first_name": "John", "last_name": "Smith",
            "email": "john@example.com", "phone": "9000000002",
            "skill_names": ["python", "sql"],
        }
        res = self.client.post(self.url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["email"], "john@example.com")
        # Skills should have been created and attached
        self.assertEqual(len(res.data["skills"]), 2)

    def test_create_sets_created_by(self):
        payload = {
            "first_name": "Jane", "last_name": "Doe",
            "email": "jane@example.com", "phone": "9000000003",
        }
        res = self.client.post(self.url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        candidate = Candidate.objects.get(email="jane@example.com")
        self.assertEqual(candidate.created_by, self.recruiter)

    def test_duplicate_email_rejected(self):
        make_candidate(email="dup@example.com", phone="9000000004")
        payload = {
            "first_name": "Other", "last_name": "Person",
            "email": "dup@example.com", "phone": "9000000005",
        }
        res = self.client.post(self.url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_phone_rejected(self):
        make_candidate(email="unique@example.com", phone="9000000006")
        payload = {
            "first_name": "Other", "last_name": "Person",
            "email": "other@example.com", "phone": "9000000006",
        }
        res = self.client.post(self.url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthenticated_rejected(self):
        self.client.credentials()  # clear auth
        res = self.client.post(self.url, {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class CandidateReadFilterTests(APITestCase):

    def setUp(self):
        self.user = make_user("recruiter@test.com")
        auth(self.client, self.user)
        self.c1 = make_candidate(email="a@x.com", phone="9001", status="active")
        self.c2 = make_candidate(email="b@x.com", phone="9002", status="passive",
                                  first_name="Bob", last_name="Builder")
        tag = SkillTag.objects.create(name="react")
        self.c1.skills.add(tag)

    def test_list_candidates(self):
        res = self.client.get(reverse("candidate-list"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["results"]), 2)

    def test_filter_by_status(self):
        res = self.client.get(reverse("candidate-list"), {"status": "passive"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["results"]), 1)
        self.assertEqual(res.data["results"][0]["email"], "b@x.com")

    def test_filter_by_skill(self):
        res = self.client.get(reverse("candidate-list"), {"skill": "react"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["results"]), 1)
        self.assertEqual(res.data["results"][0]["email"], "a@x.com")

    def test_search_by_name(self):
        res = self.client.get(reverse("candidate-list"), {"search": "Bob"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["results"]), 1)


class CandidateUpdateDeleteTests(APITestCase):

    def setUp(self):
        self.recruiter = make_user("recruiter@test.com", role=Role.RECRUITER)
        self.manager   = make_user("manager@test.com",   role=Role.ACCOUNT_MANAGER)
        self.candidate = make_candidate()

    def test_recruiter_can_update(self):
        auth(self.client, self.recruiter)
        url = reverse("candidate-detail", args=[self.candidate.id])
        res = self.client.patch(url, {"current_title": "Senior Dev"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["current_title"], "Senior Dev")

    def test_recruiter_cannot_delete(self):
        auth(self.client, self.recruiter)
        url = reverse("candidate-detail", args=[self.candidate.id])
        res = self.client.delete(url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_can_delete(self):
        auth(self.client, self.manager)
        url = reverse("candidate-detail", args=[self.candidate.id])
        res = self.client.delete(url)
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)


class CandidateSkillActionTests(APITestCase):

    def setUp(self):
        self.user = make_user("recruiter@test.com")
        auth(self.client, self.user)
        self.candidate = make_candidate()

    def test_add_skill(self):
        url = reverse("candidate-add-skill", args=[self.candidate.id])
        res = self.client.post(url, {"name": "Python"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Stored as lowercase
        self.assertEqual(res.data["skills"][0]["name"], "python")

    def test_remove_skill(self):
        tag = SkillTag.objects.create(name="java")
        self.candidate.skills.add(tag)
        url = reverse("candidate-remove-skill", args=[self.candidate.id])
        res = self.client.post(url, {"name": "java"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["skills"]), 0)

    def test_remove_nonexistent_skill_returns_404(self):
        url = reverse("candidate-remove-skill", args=[self.candidate.id])
        res = self.client.post(url, {"name": "cobol"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)