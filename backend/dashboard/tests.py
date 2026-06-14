# dashboard/tests.py

from datetime import date, timedelta
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from users.models import User, Role
from clients.models import Client
from candidates.models import Candidate
from jobs.models import Job, PipelineStage
from submittals.models import Submittal


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


def make_client_obj():
    return Client.objects.create(name="Acme", industry="Tech", status="active")


def make_job(client_obj, created_by, status="open", priority="medium", target_date=None):
    job = Job.objects.create(
        title="Engineer", client=client_obj,
        status=status, priority=priority,
        target_date=target_date, created_by=created_by,
    )
    PipelineStage.objects.create(job=job, name="Screening", order=0)
    return job


def make_candidate(n=1):
    return Candidate.objects.create(
        first_name="Jane", last_name=f"Doe{n}",
        email=f"jane{n}@example.com", phone=f"900000000{n}",
    )


def make_submittal(candidate, job, submitted_by, status="active"):
    return Submittal.objects.create(
        candidate=candidate, job=job,
        submitted_by=submitted_by, status=status,
    )


URL = reverse("dashboard-my-day")


# ── Auth Tests ────────────────────────────────────────────────────────────────

class DashboardAuthTests(APITestCase):

    def test_unauthenticated_rejected(self):
        res = self.client.get(URL)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_gets_200(self):
        user = make_user("r@test.com")
        auth(self.client, user)
        res = self.client.get(URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_response_has_required_keys(self):
        user = make_user("r@test.com")
        auth(self.client, user)
        res = self.client.get(URL)
        self.assertIn("summary", res.data)
        self.assertIn("urgent_jobs", res.data)
        self.assertIn("overdue_jobs", res.data)
        self.assertIn("stale_submittals", res.data)

    def test_summary_has_required_counts(self):
        user = make_user("r@test.com")
        auth(self.client, user)
        res = self.client.get(URL)
        summary = res.data["summary"]
        for key in ("open_jobs_count", "active_submittals_count",
                    "urgent_jobs_count", "overdue_jobs_count", "stale_submittals_count"):
            self.assertIn(key, summary)


# ── Recruiter Scoping Tests ───────────────────────────────────────────────────

class RecruiterScopeTests(APITestCase):
    """Recruiter should only see jobs assigned to them and submittals they own."""

    def setUp(self):
        self.manager   = make_user("manager@test.com", role=Role.ACCOUNT_MANAGER)
        self.recruiter = make_user("rec@test.com",     role=Role.RECRUITER)
        self.other_rec = make_user("other@test.com",   role=Role.RECRUITER)
        acme = make_client_obj()

        # job1 assigned to self.recruiter, job2 assigned to other_rec
        self.job1 = make_job(acme, self.manager)
        self.job2 = make_job(acme, self.manager)
        self.job1.assigned_to.add(self.recruiter)
        self.job2.assigned_to.add(self.other_rec)

        c1 = make_candidate(1)
        c2 = make_candidate(2)
        # submittal1 submitted by self.recruiter, submittal2 by other_rec
        self.s1 = make_submittal(c1, self.job1, self.recruiter)
        self.s2 = make_submittal(c2, self.job2, self.other_rec)

    def test_recruiter_only_sees_own_open_jobs_count(self):
        auth(self.client, self.recruiter)
        res = self.client.get(URL)
        # Only job1 is assigned to self.recruiter
        self.assertEqual(res.data["summary"]["open_jobs_count"], 1)

    def test_recruiter_only_sees_own_submittals_count(self):
        auth(self.client, self.recruiter)
        res = self.client.get(URL)
        # Only s1 was submitted by self.recruiter
        self.assertEqual(res.data["summary"]["active_submittals_count"], 1)


# ── Manager Scope Tests ───────────────────────────────────────────────────────

class ManagerScopeTests(APITestCase):
    """Manager should see all open jobs and all active submittals firm-wide."""

    def setUp(self):
        self.manager  = make_user("manager@test.com", role=Role.ACCOUNT_MANAGER)
        self.rec1     = make_user("rec1@test.com",    role=Role.RECRUITER)
        self.rec2     = make_user("rec2@test.com",    role=Role.RECRUITER)
        acme = make_client_obj()

        job1 = make_job(acme, self.manager)
        job2 = make_job(acme, self.manager)
        job1.assigned_to.add(self.rec1)
        job2.assigned_to.add(self.rec2)

        make_submittal(make_candidate(1), job1, self.rec1)
        make_submittal(make_candidate(2), job2, self.rec2)

    def test_manager_sees_all_open_jobs(self):
        auth(self.client, self.manager)
        res = self.client.get(URL)
        self.assertEqual(res.data["summary"]["open_jobs_count"], 2)

    def test_manager_sees_all_active_submittals(self):
        auth(self.client, self.manager)
        res = self.client.get(URL)
        self.assertEqual(res.data["summary"]["active_submittals_count"], 2)


# ── Urgent Jobs Tests ─────────────────────────────────────────────────────────

class UrgentJobTests(APITestCase):

    def setUp(self):
        self.manager   = make_user("manager@test.com", role=Role.ACCOUNT_MANAGER)
        self.recruiter = make_user("rec@test.com",     role=Role.RECRUITER)
        acme = make_client_obj()

        self.urgent = make_job(acme, self.manager, priority="urgent")
        self.normal = make_job(acme, self.manager, priority="medium")
        self.urgent.assigned_to.add(self.recruiter)
        self.normal.assigned_to.add(self.recruiter)

    def test_urgent_jobs_appear_in_list(self):
        auth(self.client, self.recruiter)
        res = self.client.get(URL)
        self.assertEqual(res.data["summary"]["urgent_jobs_count"], 1)
        self.assertEqual(len(res.data["urgent_jobs"]), 1)
        self.assertEqual(res.data["urgent_jobs"][0]["id"], self.urgent.id)

    def test_non_urgent_jobs_not_in_urgent_list(self):
        auth(self.client, self.recruiter)
        res = self.client.get(URL)
        ids = [j["id"] for j in res.data["urgent_jobs"]]
        self.assertNotIn(self.normal.id, ids)


# ── Overdue Jobs Tests ────────────────────────────────────────────────────────

class OverdueJobTests(APITestCase):

    def setUp(self):
        self.manager   = make_user("manager@test.com", role=Role.ACCOUNT_MANAGER)
        self.recruiter = make_user("rec@test.com",     role=Role.RECRUITER)
        acme = make_client_obj()

        yesterday = date.today() - timedelta(days=1)
        tomorrow  = date.today() + timedelta(days=1)

        self.overdue    = make_job(acme, self.manager, target_date=yesterday)
        self.not_due    = make_job(acme, self.manager, target_date=tomorrow)
        self.no_date    = make_job(acme, self.manager)
        for job in (self.overdue, self.not_due, self.no_date):
            job.assigned_to.add(self.recruiter)

    def test_overdue_job_appears_in_list(self):
        auth(self.client, self.recruiter)
        res = self.client.get(URL)
        self.assertEqual(res.data["summary"]["overdue_jobs_count"], 1)
        self.assertEqual(res.data["overdue_jobs"][0]["id"], self.overdue.id)

    def test_future_and_no_date_jobs_not_overdue(self):
        auth(self.client, self.recruiter)
        res = self.client.get(URL)
        ids = [j["id"] for j in res.data["overdue_jobs"]]
        self.assertNotIn(self.not_due.id, ids)
        self.assertNotIn(self.no_date.id, ids)


# ── Stale Submittal Tests ─────────────────────────────────────────────────────

class StaleSubmittalTests(APITestCase):

    def setUp(self):
        self.manager   = make_user("manager@test.com", role=Role.ACCOUNT_MANAGER)
        self.recruiter = make_user("rec@test.com",     role=Role.RECRUITER)
        acme = make_client_obj()
        job  = make_job(acme, self.manager)
        job.assigned_to.add(self.recruiter)

        self.fresh = make_submittal(make_candidate(1), job, self.recruiter)
        self.stale = make_submittal(make_candidate(2), job, self.recruiter)

        # Force updated_at to 8 days ago to simulate a stale submittal
        Submittal.objects.filter(pk=self.stale.pk).update(
            updated_at=timezone.now() - timedelta(days=8)
        )

    def test_stale_submittal_appears_in_list(self):
        auth(self.client, self.recruiter)
        res = self.client.get(URL)
        self.assertEqual(res.data["summary"]["stale_submittals_count"], 1)
        ids = [s["id"] for s in res.data["stale_submittals"]]
        self.assertIn(self.stale.id, ids)

    def test_fresh_submittal_not_stale(self):
        auth(self.client, self.recruiter)
        res = self.client.get(URL)
        ids = [s["id"] for s in res.data["stale_submittals"]]
        self.assertNotIn(self.fresh.id, ids)
