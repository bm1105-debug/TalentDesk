'''
 Tests CRUD on clients and contacts — 
 happy paths and permission boundaries 
 (recruiter read-only, account manager full access).

'''

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from clients.models import Client, Contact
from users.models import User, Role

class ClientSetup(APITestCase):
    """Shared setup: one CEO, one account manager, one recruiter, one client."""

    def setUp(self):
        self.ceo = User.objects.create_user(
            username="ceo", password="Str0ng!Pass", role=Role.CEO,
            first_name="CEO", last_name="User", email="ceo@test.com"
        )
        self.am = User.objects.create_user(
            username="am1", password="Str0ng!Pass", role=Role.VP,
            first_name="Account", last_name="Manager", email="am@test.com"
        )
        self.recruiter = User.objects.create_user(
            username="rec1", password="Str0ng!Pass", role=Role.RECRUITER,
            first_name="Rec", last_name="Ruiter", email="rec@test.com"
        )
        self.client_obj = Client.objects.create(
            name="Acme Corp", industry="Tech", created_by=self.ceo
        )

    def _auth(self, user):
        """Authenticate the test client as the given user."""
        url = reverse("token_obtain")
        res = self.client.post(url, {"username": user.username, "password": "Str0ng!Pass"})
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")


class ClientCRUDTests(ClientSetup):
    """Tests for /api/clients/ endpoints."""

    def test_recruiter_can_list_clients(self):
        """Recruiters can read the client list."""
        self._auth(self.recruiter)
        res = self.client.get("/api/clients/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_recruiter_cannot_create_client(self):
        """Recruiters cannot create clients."""
        self._auth(self.recruiter)
        res = self.client.post("/api/clients/", {"name": "New Co"})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_account_manager_can_create_client(self):
        """Account managers can create clients."""
        self._auth(self.am)
        res = self.client.post("/api/clients/", {"name": "New Co", "status": "active"})
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["name"], "New Co")

    def test_retrieve_client_includes_contacts(self):
        """Detail view includes nested contacts list."""
        self._auth(self.recruiter)
        res = self.client.get(f"/api/clients/{self.client_obj.id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("contacts", res.data)

    def test_account_manager_can_update_client(self):
        """Account manager can patch a client."""
        self._auth(self.am)
        res = self.client.patch(
            f"/api/clients/{self.client_obj.id}/",
            {"industry": "Finance"}
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["industry"], "Finance")

    def test_unauthenticated_request_rejected(self):
        """No token returns 401."""
        res = self.client.get("/api/clients/")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class ContactCRUDTests(ClientSetup):
    """Tests for /api/clients/<id>/contacts/ endpoints."""

    def test_recruiter_can_list_contacts(self):
        """Recruiters can read contacts for a client."""
        self._auth(self.recruiter)
        res = self.client.get(f"/api/clients/{self.client_obj.id}/contacts/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_account_manager_can_add_contact(self):
        """Account manager can add a contact to a client."""
        self._auth(self.am)
        res = self.client.post(
            f"/api/clients/{self.client_obj.id}/contacts/",
            {
                "first_name": "Jane", "last_name": "Doe",
                "email": "jane@acme.com", "is_primary": True,
            }
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["first_name"], "Jane")

    def test_recruiter_cannot_add_contact(self):
        """Recruiters cannot add contacts."""
        self._auth(self.recruiter)
        res = self.client.post(
            f"/api/clients/{self.client_obj.id}/contacts/",
            {"first_name": "Bob", "last_name": "Smith"}
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
