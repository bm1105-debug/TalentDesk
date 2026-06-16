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