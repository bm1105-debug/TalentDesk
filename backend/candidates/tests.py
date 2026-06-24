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

    def test_duplicate_email_returns_rich_error(self):
        existing = make_candidate(email="dup@example.com", phone="9000000004")
        payload = {
            "first_name": "Other", "last_name": "Person",
            "email": "dup@example.com", "phone": "9000000005",
        }
        res = self.client.post(self.url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        dup = res.data["duplicate"]
        self.assertEqual(dup["field"], "email")
        self.assertEqual(dup["id"], existing.id)
        self.assertIn("Jane", dup["name"])

    def test_duplicate_phone_returns_rich_error(self):
        existing = make_candidate(email="unique@example.com", phone="9000000006")
        payload = {
            "first_name": "Other", "last_name": "Person",
            "email": "other@example.com", "phone": "9000000006",
        }
        res = self.client.post(self.url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        dup = res.data["duplicate"]
        self.assertEqual(dup["field"], "phone")
        self.assertEqual(dup["id"], existing.id)

    def test_update_own_email_does_not_false_positive(self):
        # Updating a candidate's own email should not trigger duplicate detection
        candidate = make_candidate(email="myown@example.com", phone="9000000007", created_by=self.recruiter)
        auth(self.client, self.recruiter)
        url = reverse("candidate-detail", args=[candidate.id])
        res = self.client.patch(url, {"email": "myown@example.com"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_unauthenticated_rejected(self):
        self.client.credentials()  # clear auth
        res = self.client.post(self.url, {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class CandidateReadFilterTests(APITestCase):

    def setUp(self):
        self.user = make_user("recruiter@test.com")
        auth(self.client, self.user)
        self.c1 = make_candidate(email="a@x.com", phone="9001", status="active", created_by=self.user)
        self.c2 = make_candidate(email="b@x.com", phone="9002", status="passive",
                                  first_name="Bob", last_name="Builder", created_by=self.user)
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
        self.manager   = make_user("manager@test.com",   role=Role.VP)
        self.candidate = make_candidate(created_by=self.recruiter)

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
        self.candidate = make_candidate(created_by=self.user)

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


class BulkStatusUpdateTests(APITestCase):

    def setUp(self):
        self.recruiter = make_user("rec_bulk")
        auth(self.client, self.recruiter)
        self.c1 = make_candidate(email="b1@x.com", phone="8001", status="active", created_by=self.recruiter)
        self.c2 = make_candidate(email="b2@x.com", phone="8002", status="active", created_by=self.recruiter)
        self.c3 = make_candidate(email="b3@x.com", phone="8003", status="active", created_by=self.recruiter)
        self.url = reverse("candidate-bulk-status")

    def test_bulk_update_changes_status(self):
        res = self.client.patch(self.url, {
            "ids": [self.c1.id, self.c2.id],
            "status": "passive",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["updated"], 2)
        self.c1.refresh_from_db()
        self.c2.refresh_from_db()
        self.assertEqual(self.c1.status, "passive")
        self.assertEqual(self.c2.status, "passive")

    def test_unselected_candidate_not_changed(self):
        self.client.patch(self.url, {"ids": [self.c1.id], "status": "placed"}, format="json")
        self.c3.refresh_from_db()
        self.assertEqual(self.c3.status, "active")

    def test_invalid_status_rejected(self):
        res = self.client.patch(self.url, {"ids": [self.c1.id], "status": "retired"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_empty_ids_rejected(self):
        res = self.client.patch(self.url, {"ids": [], "status": "passive"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthenticated_rejected(self):
        self.client.credentials()
        res = self.client.patch(self.url, {"ids": [self.c1.id], "status": "passive"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)




class YearsOfExperienceTests(APITestCase):
    def setUp(self):
        self.user = make_user("exp_recruiter@x.com")
        auth(self.client, self.user)

    def test_years_of_experience_created_with_value(self):
        res = self.client.post(reverse("candidate-list"), {
            "first_name": "Alice", "last_name": "Smith",
            "email": "alice@exp.com", "phone": "8001",
            "years_of_experience": 5,
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["years_of_experience"], 5)

    def test_years_of_experience_nullable_on_create(self):
        # Omitting the field must not raise a validation error
        res = self.client.post(reverse("candidate-list"), {
            "first_name": "Bob", "last_name": "Jones",
            "email": "bob@exp.com", "phone": "8002",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(res.data["years_of_experience"])

    def test_years_of_experience_updated_via_patch(self):
        c = make_candidate(email="patch@exp.com", phone="8003", years_of_experience=3, created_by=self.user)
        res = self.client.patch(
            reverse("candidate-detail", args=[c.id]),
            {"years_of_experience": 8},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["years_of_experience"], 8)

    def test_min_experience_filter_returns_matching(self):
        make_candidate(email="senior@exp.com", phone="8004", years_of_experience=10, created_by=self.user)
        make_candidate(email="junior@exp.com", phone="8005", years_of_experience=2, created_by=self.user)
        res = self.client.get(reverse("candidate-list"), {"min_experience": 5})
        emails = [r["email"] for r in res.data["results"]]
        self.assertIn("senior@exp.com", emails)
        self.assertNotIn("junior@exp.com", emails)


class CandidateIsolationTests(APITestCase):
    """Recruiter sees own candidates only; Team Lead sees pod; AM sees all."""

    def setUp(self):
        self.team_lead = make_user("tl@iso.com", role=Role.TEAM_LEAD)
        self.rec_a = make_user("reca@iso.com", role=Role.RECRUITER)
        self.rec_a.reports_to = self.team_lead
        self.rec_a.save()
        self.rec_b = make_user("recb@iso.com", role=Role.RECRUITER)  # outside pod
        self.am = make_user("am@iso.com", role=Role.VP)

        self.c_a = make_candidate(
            email="cand_a@iso.com", phone="7001", created_by=self.rec_a
        )
        self.c_b = make_candidate(
            email="cand_b@iso.com", phone="7002", created_by=self.rec_b
        )

    def _emails(self, user):
        auth(self.client, user)
        res = self.client.get(reverse("candidate-list"))
        self.assertEqual(res.status_code, 200)
        return [r["email"] for r in res.data["results"]]

    def test_recruiter_sees_own_candidate(self):
        emails = self._emails(self.rec_a)
        self.assertIn("cand_a@iso.com", emails)

    def test_recruiter_cannot_see_other_recruiter_candidate(self):
        emails = self._emails(self.rec_a)
        self.assertNotIn("cand_b@iso.com", emails)

    def test_recruiter_gets_404_on_other_candidate_detail(self):
        auth(self.client, self.rec_a)
        res = self.client.get(reverse("candidate-detail", args=[self.c_b.id]))
        self.assertEqual(res.status_code, 404)

    def test_team_lead_sees_pod_candidate(self):
        emails = self._emails(self.team_lead)
        self.assertIn("cand_a@iso.com", emails)

    def test_team_lead_cannot_see_outside_pod_candidate(self):
        emails = self._emails(self.team_lead)
        self.assertNotIn("cand_b@iso.com", emails)

    def test_am_sees_all_candidates(self):
        emails = self._emails(self.am)
        self.assertIn("cand_a@iso.com", emails)
        self.assertIn("cand_b@iso.com", emails)

    def test_min_experience_filter_excludes_null(self):
        # Candidates with null years_of_experience must not appear in min_experience filter
        auth(self.client, self.am)
        make_candidate(email="nullexp@exp.com", phone="8006")
        res = self.client.get(reverse("candidate-list"), {"min_experience": 1})
        emails = [r["email"] for r in res.data["results"]]
        self.assertNotIn("nullexp@exp.com", emails)

    def test_min_experience_filter_invalid_returns_400(self):
        auth(self.client, self.am)
        res = self.client.get(reverse("candidate-list"), {"min_experience": "abc"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)