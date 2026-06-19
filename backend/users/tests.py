from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from users.models import User, Role


class AuthTests(APITestCase):
    """Tests for login and token endpoints."""

    def setUp(self):
        # Create one user of each role for use across tests
        self.ceo = User.objects.create_user(
            username="ceo", password="Str0ng!Pass", role=Role.CEO,
            first_name="CEO", last_name="User", email="ceo@test.com"
        )
        self.recruiter = User.objects.create_user(
            username="recruiter1", password="Str0ng!Pass", role=Role.RECRUITER,
            first_name="Rec", last_name="Ruiter", email="rec@test.com"
        )

    def _get_token(self, username, password="Str0ng!Pass"):
        """Helper: login and return the access token."""
        url = reverse("token_obtain")
        res = self.client.post(url, {"username": username, "password": password})
        return res.data.get("access")

    def test_login_returns_tokens(self):
        """Valid credentials return access and refresh tokens."""
        url = reverse("token_obtain")
        res = self.client.post(url, {"username": "ceo", "password": "Str0ng!Pass"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("access", res.data)
        self.assertIn("refresh", res.data)

    def test_login_wrong_password(self):
        """Wrong password returns 401."""
        url = reverse("token_obtain")
        res = self.client.post(url, {"username": "ceo", "password": "wrongpass"})
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class RegisterTests(APITestCase):
    """Tests for user registration — CEO only."""

    def setUp(self):
        self.ceo = User.objects.create_user(
            username="ceo", password="Str0ng!Pass", role=Role.CEO,
            first_name="CEO", last_name="User", email="ceo@test.com"
        )
        self.recruiter = User.objects.create_user(
            username="recruiter1", password="Str0ng!Pass", role=Role.RECRUITER,
            first_name="Rec", last_name="Ruiter", email="rec@test.com"
        )

    def _auth(self, user):
        """Helper: set JWT auth header for the test client."""
        token_url = reverse("token_obtain")
        res = self.client.post(token_url, {"username": user.username, "password": "Str0ng!Pass"})
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")

    def test_ceo_can_register_user(self):
        """CEO can create a new recruiter."""
        self._auth(self.ceo)
        url = reverse("user_register")
        data = {
            "username": "newrec", "email": "new@test.com",
            "first_name": "New", "last_name": "Rec",
            "role": Role.RECRUITER,
            "password": "Str0ng!Pass", "password2": "Str0ng!Pass",
        }
        res = self.client.post(url, data)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_recruiter_cannot_register_user(self):
        """Recruiters cannot create other users."""
        self._auth(self.recruiter)
        url = reverse("user_register")
        data = {
            "username": "another", "email": "a@test.com",
            "first_name": "A", "last_name": "B",
            "role": Role.RECRUITER,
            "password": "Str0ng!Pass", "password2": "Str0ng!Pass",
        }
        res = self.client.post(url, data)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_password_mismatch_rejected(self):
        """Mismatched passwords return 400."""
        self._auth(self.ceo)
        url = reverse("user_register")
        data = {
            "username": "bad", "email": "bad@test.com",
            "first_name": "Bad", "last_name": "Pass",
            "role": Role.RECRUITER,
            "password": "Str0ng!Pass", "password2": "WrongPass",
        }
        res = self.client.post(url, data)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


class ReportsToPodTests(APITestCase):
    """Tests for the reports_to FK — AM can set it, validation prevents bad values."""

    def setUp(self):
        self.am = User.objects.create_user(
            username="am", password="Str0ng!Pass", role=Role.VP,
            first_name="Alice", last_name="Manager", email="am@test.com",
        )
        self.team_lead = User.objects.create_user(
            username="tl", password="Str0ng!Pass", role=Role.TEAM_LEAD,
            first_name="Tom", last_name="Lead", email="tl@test.com",
        )
        self.recruiter = User.objects.create_user(
            username="rec", password="Str0ng!Pass", role=Role.RECRUITER,
            first_name="Rob", last_name="Rec", email="rec@test.com",
        )
        token_url = reverse("token_obtain")
        res = self.client.post(token_url, {"username": "am", "password": "Str0ng!Pass"})
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
        self.register_url = reverse("user_register")

    def test_am_can_register_user(self):
        res = self.client.post(self.register_url, {
            "username": "newrec2", "email": "new2@test.com",
            "first_name": "New", "last_name": "Two",
            "role": Role.RECRUITER,
            "password": "Str0ng!Pass", "password2": "Str0ng!Pass",
        })
        self.assertEqual(res.status_code, 201)

    def test_am_can_register_with_reports_to(self):
        res = self.client.post(self.register_url, {
            "username": "newrec3", "email": "new3@test.com",
            "first_name": "New", "last_name": "Three",
            "role": Role.RECRUITER,
            "reports_to": self.team_lead.pk,
            "password": "Str0ng!Pass", "password2": "Str0ng!Pass",
        })
        self.assertEqual(res.status_code, 201)
        created = User.objects.get(username="newrec3")
        self.assertEqual(created.reports_to_id, self.team_lead.pk)

    def test_reports_to_non_team_lead_rejected(self):
        res = self.client.post(self.register_url, {
            "username": "newrec4", "email": "new4@test.com",
            "first_name": "New", "last_name": "Four",
            "role": Role.RECRUITER,
            "reports_to": self.recruiter.pk,  # recruiter, not a team lead
            "password": "Str0ng!Pass", "password2": "Str0ng!Pass",
        })
        self.assertEqual(res.status_code, 400)

    def test_self_reference_rejected(self):
        from django.core.exceptions import ValidationError
        self.team_lead.reports_to = self.team_lead
        with self.assertRaises(ValidationError):
            self.team_lead.clean()

    def test_circular_chain_rejected(self):
        from django.core.exceptions import ValidationError
        # rec reports_to team_lead; team_lead cannot then report to rec
        self.recruiter.reports_to = self.team_lead
        self.recruiter.save()
        self.team_lead.reports_to = self.recruiter
        with self.assertRaises(ValidationError):
            self.team_lead.clean()

    def test_me_returns_reports_to_name(self):
        self.recruiter.reports_to = self.team_lead
        self.recruiter.save()
        token_url = reverse("token_obtain")
        res = self.client.post(token_url, {"username": "rec", "password": "Str0ng!Pass"})
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
        res = self.client.get(reverse("user_me"))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["reports_to_name"], "Tom Lead")


class MeViewTests(APITestCase):
    """Tests for the /me/ endpoint."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="recruiter1", password="Str0ng!Pass", role=Role.RECRUITER,
            first_name="Rec", last_name="Ruiter", email="rec@test.com"
        )

    def test_me_returns_own_profile(self):
        """Authenticated user gets their own profile."""
        token_url = reverse("token_obtain")
        res = self.client.post(token_url, {"username": "recruiter1", "password": "Str0ng!Pass"})
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")

        res = self.client.get(reverse("user_me"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["username"], "recruiter1")
        self.assertEqual(res.data["role"], Role.RECRUITER)

    def test_me_requires_auth(self):
        """Unauthenticated request returns 401."""
        res = self.client.get(reverse("user_me"))
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class ChangePasswordTests(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username="rec", password="OldPass!99", role=Role.RECRUITER,
            first_name="Rec", last_name="User", email="rec@test.com",
        )
        token_url = reverse("token_obtain")
        res = self.client.post(token_url, {"username": "rec", "password": "OldPass!99"})
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
        self.url = reverse("change_password")

    def test_correct_old_password_changes_it(self):
        res = self.client.post(self.url, {
            "old_password": "OldPass!99",
            "new_password": "NewPass!88",
            "new_password2": "NewPass!88",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewPass!88"))

    def test_wrong_old_password_rejected(self):
        res = self.client.post(self.url, {
            "old_password": "WrongOld!00",
            "new_password": "NewPass!88",
            "new_password2": "NewPass!88",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mismatched_new_passwords_rejected(self):
        res = self.client.post(self.url, {
            "old_password": "OldPass!99",
            "new_password": "NewPass!88",
            "new_password2": "Different!77",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_old_password_still_works_after_failed_attempt(self):
        self.client.post(self.url, {
            "old_password": "Wrong!00",
            "new_password": "NewPass!88",
            "new_password2": "NewPass!88",
        }, format="json")
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("OldPass!99"))

    def test_unauthenticated_rejected(self):
        self.client.credentials()
        res = self.client.post(self.url, {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


def _auth(client, user, password="Str0ng!Pass"):
    url = reverse("token_obtain")
    res = client.post(url, {"username": user.username, "password": password})
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")


class UserListTeamLeadTests(APITestCase):
    """Team Lead can list users; sees only their own direct reports."""

    def setUp(self):
        self.am = User.objects.create_user(
            username="am", password="Str0ng!Pass", role=Role.VP,
            first_name="Alice", last_name="Manager", email="am@tl.com",
        )
        self.tl = User.objects.create_user(
            username="tl", password="Str0ng!Pass", role=Role.TEAM_LEAD,
            first_name="Tom", last_name="Lead", email="tl@tl.com",
        )
        self.tl2 = User.objects.create_user(
            username="tl2", password="Str0ng!Pass", role=Role.TEAM_LEAD,
            first_name="Tina", last_name="Lead2", email="tl2@tl.com",
        )
        self.rec_in_pod = User.objects.create_user(
            username="rec1", password="Str0ng!Pass", role=Role.RECRUITER,
            first_name="Pod", last_name="Member", email="rec1@tl.com",
            reports_to=self.tl,
        )
        self.rec_other_pod = User.objects.create_user(
            username="rec2", password="Str0ng!Pass", role=Role.RECRUITER,
            first_name="Other", last_name="Pod", email="rec2@tl.com",
            reports_to=self.tl2,
        )
        self.recruiter_no_pod = User.objects.create_user(
            username="rec3", password="Str0ng!Pass", role=Role.RECRUITER,
            first_name="No", last_name="Pod", email="rec3@tl.com",
        )
        self.url = reverse("user_list")

    def test_team_lead_can_access_user_list(self):
        _auth(self.client, self.tl)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_team_lead_sees_only_direct_reports(self):
        _auth(self.client, self.tl)
        res = self.client.get(self.url)
        ids = [u["id"] for u in (res.data.get("results") or res.data)]
        self.assertIn(self.rec_in_pod.id, ids)
        self.assertNotIn(self.rec_other_pod.id, ids)
        self.assertNotIn(self.recruiter_no_pod.id, ids)
        self.assertNotIn(self.tl.id, ids)
        self.assertNotIn(self.am.id, ids)

    def test_team_lead_with_no_direct_reports_gets_empty_list(self):
        _auth(self.client, self.tl2)
        # tl2 has rec_other_pod assigned; remove them to test truly empty pod
        self.rec_other_pod.reports_to = None
        self.rec_other_pod.save()
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get("results") if "results" in res.data else res.data
        self.assertEqual(len(results), 0)

    def test_recruiter_cannot_access_user_list(self):
        _auth(self.client, self.rec_in_pod)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_vp_sees_all_users(self):
        _auth(self.client, self.am)
        res = self.client.get(self.url)
        ids = [u["id"] for u in (res.data.get("results") if "results" in res.data else res.data)]
        self.assertIn(self.rec_in_pod.id, ids)
        self.assertIn(self.rec_other_pod.id, ids)
        self.assertIn(self.tl.id, ids)
        self.assertIn(self.am.id, ids)  # VP sees themselves too