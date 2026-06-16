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


# ── Analytics Scaffold Tests ──────────────────────────────────────────────────

class AnalyticsScaffoldTests(APITestCase):

    def setUp(self):
        self.user = make_user("rec@analytics.com")
        auth(self.client, self.user)
        self.url = reverse("dashboard-analytics")

    def test_returns_200_with_all_seven_keys(self):
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        for key in [
            "candidate_pool", "source_effectiveness", "open_jobs",
            "recruiter_leaderboard", "interview_outcomes",
            "pipeline_funnel", "time_to_fill",
        ]:
            self.assertIn(key, res.data)

    def test_unauthenticated_returns_401(self):
        self.client.credentials()
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


# ── Analytics: Candidate Pool + Source Effectiveness Tests ────────────────────

class AnalyticsCandidatePoolTests(APITestCase):

    def setUp(self):
        self.user = make_user("pool@analytics.com")
        auth(self.client, self.user)
        self.url = reverse("dashboard-analytics")
        Candidate.objects.create(first_name="A", last_name="B", email="a@x.com", phone="1", status="active",   source="linkedin")
        Candidate.objects.create(first_name="C", last_name="D", email="c@x.com", phone="2", status="active",   source="linkedin")
        Candidate.objects.create(first_name="E", last_name="F", email="e@x.com", phone="3", status="passive",  source="referral")
        Candidate.objects.create(first_name="G", last_name="H", email="g@x.com", phone="4", status="placed",   source="linkedin")
        Candidate.objects.create(first_name="I", last_name="J", email="i@x.com", phone="5", status="blacklisted", source="other")

    def test_candidate_pool_counts(self):
        res = self.client.get(self.url)
        pool = res.data["candidate_pool"]
        self.assertEqual(pool["active"],      2)
        self.assertEqual(pool["passive"],     1)
        self.assertEqual(pool["placed"],      1)
        self.assertEqual(pool["blacklisted"], 1)

    def test_source_effectiveness_candidates_count(self):
        res = self.client.get(self.url)
        sources = {s["source"]: s for s in res.data["source_effectiveness"]}
        self.assertEqual(sources["linkedin"]["candidates"], 3)
        self.assertEqual(sources["referral"]["candidates"], 1)

    def test_source_effectiveness_placements_count(self):
        res = self.client.get(self.url)
        sources = {s["source"]: s for s in res.data["source_effectiveness"]}
        self.assertEqual(sources["linkedin"]["placements"], 1)
        self.assertEqual(sources["referral"]["placements"], 0)

    def test_source_with_no_candidates_excluded(self):
        res = self.client.get(self.url)
        present = {s["source"] for s in res.data["source_effectiveness"]}
        # job_board has no candidates, so must not appear
        self.assertNotIn("job_board", present)

    def test_empty_pool_returns_zeros(self):
        Candidate.objects.all().delete()
        res = self.client.get(self.url)
        pool = res.data["candidate_pool"]
        self.assertEqual(pool["active"], 0)
        self.assertEqual(pool["placed"], 0)
        self.assertEqual(res.data["source_effectiveness"], [])


# ── Analytics: Open Jobs Breakdown Tests ──────────────────────────────────────

class AnalyticsOpenJobsTests(APITestCase):

    def setUp(self):
        self.user = make_user("openjobs@analytics.com")
        auth(self.client, self.user)
        self.url = reverse("dashboard-analytics")
        client_obj = make_client_obj()
        make_job(client_obj, self.user, status="open",     priority="urgent")
        make_job(client_obj, self.user, status="open",     priority="high")
        make_job(client_obj, self.user, status="on_hold",  priority="medium")
        make_job(client_obj, self.user, status="draft",    priority="low")
        make_job(client_obj, self.user, status="cancelled", priority="low")  # must be excluded

    def test_by_status_excludes_cancelled(self):
        res = self.client.get(self.url)
        by_status = res.data["open_jobs"]["by_status"]
        self.assertEqual(by_status["open"],    2)
        self.assertEqual(by_status["on_hold"], 1)
        self.assertEqual(by_status["draft"],   1)

    def test_cancelled_not_counted_in_any_bucket(self):
        res = self.client.get(self.url)
        by_status = res.data["open_jobs"]["by_status"]
        total = sum(by_status.values())
        self.assertEqual(total, 4)  # 5 jobs created, 1 cancelled excluded

    def test_by_priority_counts(self):
        res = self.client.get(self.url)
        by_priority = res.data["open_jobs"]["by_priority"]
        self.assertEqual(by_priority["urgent"], 1)
        self.assertEqual(by_priority["high"],   1)
        self.assertEqual(by_priority["medium"], 1)
        self.assertEqual(by_priority["low"],    1)

    def test_empty_returns_zeros(self):
        Job.objects.all().delete()
        res = self.client.get(self.url)
        by_status = res.data["open_jobs"]["by_status"]
        self.assertTrue(all(v == 0 for v in by_status.values()))


# ── Analytics: Recruiter Leaderboard Tests ────────────────────────────────────

class AnalyticsLeaderboardTests(APITestCase):

    def setUp(self):
        self.me = make_user("me@analytics.com")
        self.other = make_user("other@analytics.com")
        auth(self.client, self.me)
        self.url = reverse("dashboard-analytics")

        client_obj = make_client_obj()
        job = make_job(client_obj, self.me)
        cand = lambda e, p: Candidate.objects.create(
            first_name="X", last_name="Y", email=e, phone=p
        )

        # me: 1 placed, 2 active
        Submittal.objects.create(candidate=cand("c1@x.com","1"), job=job, submitted_by=self.me, status="placed")
        Submittal.objects.create(candidate=cand("c2@x.com","2"), job=job, submitted_by=self.me, status="active")
        Submittal.objects.create(candidate=cand("c3@x.com","3"), job=job, submitted_by=self.me, status="active")

        # other: 3 placed, 0 active — should rank first
        job2 = make_job(client_obj, self.other)
        Submittal.objects.create(candidate=cand("c4@x.com","4"), job=job2, submitted_by=self.other, status="placed")
        Submittal.objects.create(candidate=cand("c5@x.com","5"), job=job2, submitted_by=self.other, status="placed")
        Submittal.objects.create(candidate=cand("c6@x.com","6"), job=job2, submitted_by=self.other, status="placed")

    def test_sorted_by_placements_descending(self):
        res = self.client.get(self.url)
        lb = res.data["recruiter_leaderboard"]
        self.assertEqual(lb[0]["placements"], 3)
        self.assertEqual(lb[1]["placements"], 1)

    def test_counts_are_correct(self):
        res = self.client.get(self.url)
        lb = {row["id"]: row for row in res.data["recruiter_leaderboard"]}
        self.assertEqual(lb[self.me.id]["active"],     2)
        self.assertEqual(lb[self.me.id]["placements"], 1)
        self.assertEqual(lb[self.other.id]["active"],     0)
        self.assertEqual(lb[self.other.id]["placements"], 3)

    def test_empty_returns_empty_list(self):
        Submittal.objects.all().delete()
        res = self.client.get(self.url)
        self.assertEqual(res.data["recruiter_leaderboard"], [])


# ── Analytics: Interview Outcomes Tests ───────────────────────────────────────

from interviews.models import Interview
from django.utils import timezone as tz

def make_interview(submittal, created_by, status="completed", score=None):
    return Interview.objects.create(
        submittal=submittal,
        interview_type="phone",
        scheduled_at=tz.now(),
        status=status,
        score=score,
        created_by=created_by,
    )


class AnalyticsInterviewOutcomesTests(APITestCase):

    def setUp(self):
        self.user = make_user("iv@analytics.com")
        auth(self.client, self.user)
        self.url = reverse("dashboard-analytics")
        client_obj = make_client_obj()
        job = make_job(client_obj, self.user)
        cand = make_candidate()
        sub = make_submittal(cand, job, self.user)
        make_interview(sub, self.user, status="completed", score=80)
        make_interview(sub, self.user, status="completed", score=60)
        make_interview(sub, self.user, status="cancelled")
        make_interview(sub, self.user, status="no_show")

    def test_status_counts(self):
        res = self.client.get(self.url)
        outcomes = res.data["interview_outcomes"]
        self.assertEqual(outcomes["completed"], 2)
        self.assertEqual(outcomes["cancelled"],  1)
        self.assertEqual(outcomes["no_show"],    1)

    def test_avg_score_excludes_null_scores(self):
        res = self.client.get(self.url)
        # Only the 2 completed interviews have scores (80 + 60) / 2 = 70.0
        self.assertEqual(res.data["interview_outcomes"]["avg_score"], 70.0)

    def test_avg_score_is_null_when_no_scores_recorded(self):
        Interview.objects.all().update(score=None)
        res = self.client.get(self.url)
        self.assertIsNone(res.data["interview_outcomes"]["avg_score"])

    def test_empty_returns_zeros_and_null_score(self):
        Interview.objects.all().delete()
        res = self.client.get(self.url)
        outcomes = res.data["interview_outcomes"]
        self.assertEqual(outcomes["completed"], 0)
        self.assertIsNone(outcomes["avg_score"])


# ── Analytics: Pipeline Funnel Tests ─────────────────────────────────────────

class AnalyticsPipelineFunnelTests(APITestCase):

    def setUp(self):
        self.user = make_user("funnel@analytics.com")
        auth(self.client, self.user)
        self.url = reverse("dashboard-analytics")
        client_obj = make_client_obj()
        job = make_job(client_obj, self.user)

        # make_job already creates a "Screening" stage at order=0; fetch it and add "Interview"
        self.s1 = PipelineStage.objects.get(job=job, name="Screening")
        self.s2 = PipelineStage.objects.create(job=job, name="Interview", order=1)

        cand = lambda e, p: Candidate.objects.create(
            first_name="X", last_name="Y", email=e, phone=p
        )

        # 2 active at Screening, 1 active at Interview
        sub1 = make_submittal(cand("f1@x.com", "101"), job, self.user)
        sub1.current_stage = self.s1; sub1.save()
        sub2 = make_submittal(cand("f2@x.com", "102"), job, self.user)
        sub2.current_stage = self.s1; sub2.save()
        sub3 = make_submittal(cand("f3@x.com", "103"), job, self.user)
        sub3.current_stage = self.s2; sub3.save()

        # Placed submittal at s1 — must NOT appear (only active counted)
        sub4 = make_submittal(cand("f4@x.com", "104"), job, self.user, status="placed")
        sub4.current_stage = self.s1; sub4.save()

        # Active submittal with no stage — must NOT appear
        make_submittal(cand("f5@x.com", "105"), job, self.user)

    def test_counts_are_correct(self):
        res = self.client.get(self.url)
        funnel = {row["stage"]: row["count"] for row in res.data["pipeline_funnel"]}
        self.assertEqual(funnel["Screening"], 2)
        self.assertEqual(funnel["Interview"], 1)

    def test_ordered_by_stage_order(self):
        res = self.client.get(self.url)
        stages = [row["stage"] for row in res.data["pipeline_funnel"]]
        self.assertEqual(stages, ["Screening", "Interview"])

    def test_non_active_submittals_excluded(self):
        res = self.client.get(self.url)
        # Placed submittal was at Screening — count should still be 2, not 3
        funnel = {row["stage"]: row["count"] for row in res.data["pipeline_funnel"]}
        self.assertEqual(funnel["Screening"], 2)

    def test_null_stage_submittals_excluded(self):
        res = self.client.get(self.url)
        # Only 2 stages should appear; the stageless active submittal must not create a null entry
        self.assertEqual(len(res.data["pipeline_funnel"]), 2)

    def test_empty_returns_empty_list(self):
        Submittal.objects.all().delete()
        res = self.client.get(self.url)
        self.assertEqual(res.data["pipeline_funnel"], [])


# ── Analytics: Time to Fill Tests ────────────────────────────────────────────

class AnalyticsTimeToFillTests(APITestCase):

    def setUp(self):
        self.user = make_user("ttf@analytics.com")
        auth(self.client, self.user)
        self.url = reverse("dashboard-analytics")
        client_obj = make_client_obj()

        now = timezone.now()

        # Job A opened 30 days ago, placed 10 days ago → 20 days to fill
        self.job_a = make_job(client_obj, self.user)
        Job.objects.filter(pk=self.job_a.pk).update(created_at=now - timedelta(days=30))
        self.job_a.refresh_from_db()
        cand_a = make_candidate(n=10)
        sub_a = make_submittal(cand_a, self.job_a, self.user, status="placed")
        Submittal.objects.filter(pk=sub_a.pk).update(updated_at=now - timedelta(days=10))

        # Job B opened 40 days ago, placed 0 days ago → 40 days to fill
        self.job_b = make_job(client_obj, self.user)
        Job.objects.filter(pk=self.job_b.pk).update(created_at=now - timedelta(days=40))
        self.job_b.refresh_from_db()
        cand_b = make_candidate(n=11)
        sub_b = make_submittal(cand_b, self.job_b, self.user, status="placed")
        Submittal.objects.filter(pk=sub_b.pk).update(updated_at=now)

    def test_avg_days_is_correct(self):
        res = self.client.get(self.url)
        # (20 + 40) / 2 = 30
        self.assertEqual(res.data["time_to_fill"]["avg_days"], 30)

    def test_by_job_sorted_by_days_descending(self):
        res = self.client.get(self.url)
        by_job = res.data["time_to_fill"]["by_job"]
        self.assertEqual(len(by_job), 2)
        self.assertGreaterEqual(by_job[0]["days"], by_job[1]["days"])

    def test_by_job_days_values(self):
        res = self.client.get(self.url)
        days_set = {r["days"] for r in res.data["time_to_fill"]["by_job"]}
        self.assertIn(20, days_set)
        self.assertIn(40, days_set)

    def test_unfilled_job_excluded(self):
        # Add a job with only an active submittal — must not appear in by_job
        job_c = make_job(make_client_obj(), self.user)
        make_submittal(make_candidate(n=12), job_c, self.user, status="active")
        res = self.client.get(self.url)
        ids = {r["id"] for r in res.data["time_to_fill"]["by_job"]}
        self.assertNotIn(job_c.id, ids)

    def test_avg_days_null_when_no_placements(self):
        Submittal.objects.filter(status="placed").update(status="active")
        res = self.client.get(self.url)
        self.assertIsNone(res.data["time_to_fill"]["avg_days"])
        self.assertEqual(res.data["time_to_fill"]["by_job"], [])


# ── Scorecard Tests ───────────────────────────────────────────────────────────

class ScorecardTests(APITestCase):

    def setUp(self):
        self.user = make_user("sc@scorecard.com")
        self.other = make_user("other@scorecard.com")
        auth(self.client, self.user)
        self.url = reverse("dashboard-scorecard")

        client_obj = make_client_obj()
        job = make_job(client_obj, self.user)

        cand = lambda e, p: Candidate.objects.create(
            first_name="A", last_name="B", email=e, phone=p
        )

        # my submittals: 2 active, 1 placed, 1 rejected, 1 withdrawn
        Submittal.objects.create(candidate=cand("s1@x.com", "1"), job=job, submitted_by=self.user, status="active")
        Submittal.objects.create(candidate=cand("s2@x.com", "2"), job=job, submitted_by=self.user, status="active")
        Submittal.objects.create(candidate=cand("s3@x.com", "3"), job=job, submitted_by=self.user, status="placed")
        Submittal.objects.create(candidate=cand("s4@x.com", "4"), job=job, submitted_by=self.user, status="rejected")
        Submittal.objects.create(candidate=cand("s5@x.com", "5"), job=job, submitted_by=self.user, status="withdrawn")

        # other recruiter's submittal — must NOT appear in my scorecard
        job2 = make_job(client_obj, self.other)
        Submittal.objects.create(candidate=cand("s6@x.com", "6"), job=job2, submitted_by=self.other, status="placed")

    def test_returns_200(self):
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_unauthenticated_returns_401(self):
        self.client.credentials()
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_stats_scoped_to_user(self):
        res = self.client.get(self.url)
        s = res.data["stats"]
        self.assertEqual(s["total"],     5)
        self.assertEqual(s["active"],    2)
        self.assertEqual(s["placed"],    1)
        self.assertEqual(s["rejected"],  1)
        self.assertEqual(s["withdrawn"], 1)

    def test_conversion_rate(self):
        res = self.client.get(self.url)
        # 1 placed out of 5 total = 20.0%
        self.assertEqual(res.data["stats"]["conversion_rate"], 20.0)

    def test_conversion_rate_zero_when_no_submittals(self):
        Submittal.objects.filter(submitted_by=self.user).delete()
        res = self.client.get(self.url)
        self.assertEqual(res.data["stats"]["conversion_rate"], 0.0)
        self.assertEqual(res.data["stats"]["total"], 0)

    def test_other_recruiter_excluded(self):
        res = self.client.get(self.url)
        # other recruiter has 1 placed, but my placed count is still 1 (not 2)
        self.assertEqual(res.data["stats"]["placed"], 1)

    def test_recent_placements_returned(self):
        res = self.client.get(self.url)
        self.assertEqual(len(res.data["recent_placements"]), 1)
        self.assertIn("candidate", res.data["recent_placements"][0])
        self.assertIn("job",       res.data["recent_placements"][0])
        self.assertIn("placed_at", res.data["recent_placements"][0])

    def test_pipeline_only_active(self):
        # pipeline should only count active submittals (placed/rejected/withdrawn excluded)
        res = self.client.get(self.url)
        total_in_pipeline = sum(r["count"] for r in res.data["pipeline"])
        # 2 active but both have no stage set → pipeline is empty (null stage excluded)
        self.assertEqual(total_in_pipeline, 0)
