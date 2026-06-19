import io
from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework import status

from users.models import User, Role
from candidates.models import Candidate
from .models import Attachment
from .parsers import parse_resume


def make_user(username, role=Role.RECRUITER):
    return User.objects.create_user(username=username, password='pass1234', role=role)


def make_candidate(email='test@example.com'):
    return Candidate.objects.create(
        first_name='Test', last_name='User',
        email=email, phone='+10000000001',
    )


# ── Parser unit tests ──────────────────────────────────────────────────────────

class ResumeParserTest(TestCase):

    def _make_txt(self, content):
        return io.BytesIO(content.encode('utf-8')), 'resume.txt'

    def test_extracts_email(self):
        text = "John Smith\nSoftware Engineer\njohn.smith@example.com\n+44 7700 900000"
        f, name = self._make_txt(text)
        result = parse_resume(f, name)
        self.assertEqual(result['email'], 'john.smith@example.com')

    def test_extracts_name(self):
        text = "Jane Doe\nProduct Manager\njane@example.com"
        f, name = self._make_txt(text)
        result = parse_resume(f, name)
        self.assertEqual(result['first_name'], 'Jane')
        self.assertEqual(result['last_name'], 'Doe')

    def test_extracts_phone(self):
        text = "John Smith\nEngineer\njohn@example.com\n+44 7700 900123"
        f, name = self._make_txt(text)
        result = parse_resume(f, name)
        self.assertIn('7700', result['phone'])

    def test_missing_fields_return_empty_string(self):
        text = "No useful information here at all."
        f, name = self._make_txt(text)
        result = parse_resume(f, name)
        self.assertEqual(result['email'], '')
        self.assertNotIn('error', result)

    def test_unsupported_type_returns_error(self):
        f = io.BytesIO(b'some bytes')
        result = parse_resume(f, 'resume.xlsx')
        self.assertIn('error', result)


# ── API tests ──────────────────────────────────────────────────────────────────

class AttachmentAPITest(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.recruiter = make_user('recruiter_att')
        self.manager   = make_user('manager_att', Role.VP)
        self.candidate = make_candidate('att_candidate@example.com')

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def _txt_file(self, content='hello'):
        return SimpleUploadedFile('cv.txt', content.encode(), content_type='text/plain')

    # Upload
    def test_recruiter_can_upload(self):
        self._auth(self.recruiter)
        resp = self.client.post('/api/attachments/', {
            'candidate': self.candidate.id,
            'file': self._txt_file(),
        }, format='multipart')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data['original_name'], 'cv.txt')

    def test_upload_requires_candidate(self):
        self._auth(self.recruiter)
        resp = self.client.post('/api/attachments/', {
            'file': self._txt_file(),
        }, format='multipart')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthenticated_cannot_upload(self):
        resp = self.client.post('/api/attachments/', {
            'candidate': self.candidate.id,
            'file': self._txt_file(),
        }, format='multipart')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    # List
    def test_list_filtered_by_candidate(self):
        self._auth(self.recruiter)
        att = Attachment.objects.create(
            candidate=self.candidate,
            file=SimpleUploadedFile('a.txt', b'x'),
            original_name='a.txt',
            file_size=1,
            uploaded_by=self.recruiter,
        )
        resp = self.client.get(f'/api/attachments/?candidate={self.candidate.id}')
        self.assertEqual(resp.status_code, 200)
        ids = [r['id'] for r in resp.data['results']]
        self.assertIn(att.id, ids)

    # Delete
    def test_recruiter_cannot_delete(self):
        self._auth(self.recruiter)
        att = Attachment.objects.create(
            candidate=self.candidate,
            file=SimpleUploadedFile('b.txt', b'x'),
            original_name='b.txt',
            file_size=1,
            uploaded_by=self.recruiter,
        )
        resp = self.client.delete(f'/api/attachments/{att.id}/')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_can_delete(self):
        self._auth(self.manager)
        att = Attachment.objects.create(
            candidate=self.candidate,
            file=SimpleUploadedFile('c.txt', b'x'),
            original_name='c.txt',
            file_size=1,
            uploaded_by=self.recruiter,
        )
        resp = self.client.delete(f'/api/attachments/{att.id}/')
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)

    # Parse endpoint
    def test_parse_txt_returns_fields(self):
        self._auth(self.recruiter)
        content = "Jane Doe\nProduct Manager\njane.doe@example.com\n+44 7700 900001"
        resp = self.client.post('/api/attachments/parse/', {
            'file': SimpleUploadedFile('resume.txt', content.encode(), content_type='text/plain'),
        }, format='multipart')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('email', resp.data)
        self.assertIn('first_name', resp.data)

    def test_parse_without_file_returns_400(self):
        self._auth(self.recruiter)
        resp = self.client.post('/api/attachments/parse/', {}, format='multipart')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
