# submittals/tests.py

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from communications.models import EmailTemplate
from users.models import User, Role
from clients.models import Client
from candidates.models import Candidate, SkillTag
from jobs.models import Job, PipelineStage
from .models import Submittal, SubmittalEvent, calculate_match_score


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


def make_client():
    return Client.objects.create(name="Acme Corp", industry="Tech", status="active")


def make_candidate(email="jane@example.com", phone="9000000001"):
    return Candidate.objects.create(
        first_name="Jane", last_name="Doe", email=email, phone=phone
    )


def make_job(client, created_by):
    # Bypass the serializer — create job + stages directly so tests are fast
    job = Job.objects.create(
        title="Backend Engineer", client=client,
        status="open", created_by=created_by,
    )
    for i, name in enumerate(["Screening", "Interview", "Offer"]):
        PipelineStage.objects.create(job=job, name=name, order=i)
    return job


def make_submittal(candidate, job, submitted_by):
    return Submittal.objects.create(
        candidate=candidate, job=job, submitted_by=submitted_by
    )


# ── Submittal Create Tests ────────────────────────────────────────────────────

class SubmittalCreateTests(APITestCase):

    def setUp(self):
        self.recruiter = make_user("recruiter@test.com", role=Role.RECRUITER)
        self.manager   = make_user("manager@test.com",   role=Role.VP)
        auth(self.client, self.recruiter)
        self.acme      = make_client()
        self.job       = make_job(self.acme, self.manager)
        self.candidate = make_candidate()
        self.url       = reverse("submittal-list")

    def test_recruiter_can_create_submittal(self):
        payload = {"candidate": self.candidate.id, "job": self.job.id, "cover_note": "Great fit"}
        res = self.client.post(self.url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["job_title"], "Backend Engineer")
        self.assertEqual(res.data["candidate_name"], "Jane Doe")

    def test_duplicate_submittal_rejected(self):
        # Same candidate submitted twice to the same job must be blocked
        make_submittal(self.candidate, self.job, self.recruiter)
        payload = {"candidate": self.candidate.id, "job": self.job.id}
        res = self.client.post(self.url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_submitted_by_auto_set(self):
        payload = {"candidate": self.candidate.id, "job": self.job.id}
        res = self.client.post(self.url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        submittal = Submittal.objects.get(id=res.data["id"])
        self.assertEqual(submittal.submitted_by, self.recruiter)

    def test_unauthenticated_rejected(self):
        self.client.credentials()
        res = self.client.post(self.url, {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


# ── Submittal Filter Tests ────────────────────────────────────────────────────

class SubmittalFilterTests(APITestCase):

    def setUp(self):
        self.recruiter = make_user("recruiter@test.com")
        self.manager   = make_user("manager@test.com", role=Role.VP)
        auth(self.client, self.recruiter)
        self.acme  = make_client()
        self.job1  = make_job(self.acme, self.manager)
        self.job2  = make_job(self.acme, self.manager)
        self.c1    = make_candidate(email="c1@x.com", phone="9001")
        self.c2    = make_candidate(email="c2@x.com", phone="9002")
        self.s1    = make_submittal(self.c1, self.job1, self.recruiter)
        self.s2    = make_submittal(self.c2, self.job2, self.recruiter)

    def test_filter_by_job(self):
        res = self.client.get(reverse("submittal-list"), {"job": self.job1.id})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["results"]), 1)
        self.assertEqual(res.data["results"][0]["job"], self.job1.id)

    def test_filter_by_candidate(self):
        res = self.client.get(reverse("submittal-list"), {"candidate": self.c2.id})
        self.assertEqual(len(res.data["results"]), 1)
        self.assertEqual(res.data["results"][0]["candidate"], self.c2.id)

    def test_filter_by_status(self):
        self.s1.status = "rejected"
        self.s1.save()
        res = self.client.get(reverse("submittal-list"), {"status": "rejected"})
        self.assertEqual(len(res.data["results"]), 1)


# ── Advance Stage Tests ───────────────────────────────────────────────────────

class SubmittalAdvanceTests(APITestCase):

    def setUp(self):
        self.recruiter = make_user("recruiter@test.com")
        self.manager   = make_user("manager@test.com", role=Role.VP)
        auth(self.client, self.recruiter)
        self.acme      = make_client()
        self.job       = make_job(self.acme, self.manager)
        self.candidate = make_candidate()
        self.submittal = make_submittal(self.candidate, self.job, self.recruiter)
        self.stages    = list(self.job.stages.order_by("order"))

    def test_advance_to_valid_stage(self):
        url = reverse("submittal-advance", args=[self.submittal.id])
        res = self.client.post(url, {"stage_id": self.stages[0].id, "notes": "Good call"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["current_stage"], self.stages[0].id)
        self.assertEqual(SubmittalEvent.objects.filter(submittal=self.submittal).count(), 1)

    def test_advance_writes_correct_event(self):
        url = reverse("submittal-advance", args=[self.submittal.id])
        self.client.post(url, {"stage_id": self.stages[0].id, "notes": "Passed"}, format="json")
        event = SubmittalEvent.objects.get(submittal=self.submittal)
        self.assertEqual(event.event_type, SubmittalEvent.EventType.STAGE_CHANGE)
        self.assertIsNone(event.from_stage)   # no prior stage on first advance
        self.assertEqual(event.to_stage, self.stages[0])
        self.assertEqual(event.notes, "Passed")

    def test_advance_records_from_stage_on_second_move(self):
        # Move to stage 0 first, then advance to stage 1 — from_stage must be stage 0
        url = reverse("submittal-advance", args=[self.submittal.id])
        self.client.post(url, {"stage_id": self.stages[0].id}, format="json")
        self.client.post(url, {"stage_id": self.stages[1].id, "notes": "Interview done"}, format="json")
        last_event = SubmittalEvent.objects.filter(submittal=self.submittal).last()
        self.assertEqual(last_event.from_stage, self.stages[0])
        self.assertEqual(last_event.to_stage,   self.stages[1])

    def test_advance_rejects_stage_from_different_job(self):
        other_job     = make_job(self.acme, self.manager)
        foreign_stage = other_job.stages.first()
        url = reverse("submittal-advance", args=[self.submittal.id])
        res = self.client.post(url, {"stage_id": foreign_stage.id}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


# ── Add Note Tests ────────────────────────────────────────────────────────────

class SubmittalNoteTests(APITestCase):

    def setUp(self):
        self.recruiter = make_user("recruiter@test.com")
        self.manager   = make_user("manager@test.com", role=Role.VP)
        auth(self.client, self.recruiter)
        self.acme      = make_client()
        self.job       = make_job(self.acme, self.manager)
        self.candidate = make_candidate()
        self.submittal = make_submittal(self.candidate, self.job, self.recruiter)

    def test_add_note_creates_event(self):
        url = reverse("submittal-add-note", args=[self.submittal.id])
        res = self.client.post(url, {"notes": "Client loved the CV"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        event = SubmittalEvent.objects.get(submittal=self.submittal)
        self.assertEqual(event.event_type, SubmittalEvent.EventType.NOTE)
        self.assertEqual(event.notes, "Client loved the CV")

    def test_add_note_blank_rejected(self):
        url = reverse("submittal-add-note", args=[self.submittal.id])
        res = self.client.post(url, {"notes": ""}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


# ── Change Status Tests ───────────────────────────────────────────────────────

class SubmittalStatusTests(APITestCase):

    def setUp(self):
        self.recruiter = make_user("recruiter@test.com", role=Role.RECRUITER)
        self.manager   = make_user("manager@test.com",   role=Role.VP)
        acme           = make_client()
        job            = make_job(acme, self.manager)
        candidate      = make_candidate()
        self.submittal = make_submittal(candidate, job, self.recruiter)

    def test_manager_can_change_status(self):
        auth(self.client, self.manager)
        url = reverse("submittal-change-status", args=[self.submittal.id])
        res = self.client.post(url, {"status": "rejected", "notes": "Salary too high"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.submittal.refresh_from_db()
        self.assertEqual(self.submittal.status, "rejected")

    def test_change_status_writes_event(self):
        auth(self.client, self.manager)
        url = reverse("submittal-change-status", args=[self.submittal.id])
        self.client.post(url, {"status": "placed", "notes": "Offer accepted"}, format="json")
        event = SubmittalEvent.objects.get(submittal=self.submittal)
        self.assertEqual(event.event_type, SubmittalEvent.EventType.STATUS_CHANGE)

    def test_recruiter_cannot_change_status(self):
        auth(self.client, self.recruiter)
        url = reverse("submittal-change-status", args=[self.submittal.id])
        res = self.client.post(url, {"status": "rejected"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_invalid_status_rejected(self):
        auth(self.client, self.manager)
        url = reverse("submittal-change-status", args=[self.submittal.id])
        res = self.client.post(url, {"status": "nonsense"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


# ── Shortlist Flag Tests ──────────────────────────────────────────────────────

class ShortlistFlagTests(APITestCase):

    def setUp(self):
        self.recruiter = make_user("rec@test.com", role=Role.RECRUITER)
        self.manager   = make_user("mgr@test.com", role=Role.VP)
        acme           = make_client()
        job            = make_job(acme, self.manager)
        c1             = make_candidate(email="a@x.com", phone="9001")
        c2             = make_candidate(email="b@x.com", phone="9002")
        self.s1 = make_submittal(c1, job, self.recruiter)
        self.s2 = make_submittal(c2, job, self.recruiter)
        auth(self.client, self.recruiter)

    def _patch(self, submittal, payload):
        return self.client.patch(
            reverse("submittal-detail", args=[submittal.id]),
            payload, format="json",
        )

    def test_is_shortlisted_defaults_false(self):
        res = self.client.get(reverse("submittal-list"))
        self.assertFalse(res.data["results"][0]["is_shortlisted"])

    def test_patch_toggles_shortlist_on(self):
        res = self._patch(self.s1, {"is_shortlisted": True})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["is_shortlisted"])
        self.s1.refresh_from_db()
        self.assertTrue(self.s1.is_shortlisted)

    def test_patch_toggles_shortlist_off(self):
        self.s1.is_shortlisted = True
        self.s1.save(update_fields=["is_shortlisted", "updated_at"])
        res = self._patch(self.s1, {"is_shortlisted": False})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.data["is_shortlisted"])

    def test_filter_shortlisted_true_returns_only_shortlisted(self):
        self.s1.is_shortlisted = True
        self.s1.save(update_fields=["is_shortlisted", "updated_at"])
        res = self.client.get(reverse("submittal-list"), {"shortlisted": "true"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["id"], self.s1.id)

    def test_filter_shortlisted_returns_empty_when_none_shortlisted(self):
        res = self.client.get(reverse("submittal-list"), {"shortlisted": "true"})
        self.assertEqual(res.data["count"], 0)

    def test_manager_can_toggle_shortlist(self):
        auth(self.client, self.manager)
        res = self._patch(self.s1, {"is_shortlisted": True})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["is_shortlisted"])

    def test_unauthenticated_patch_rejected(self):
        self.client.credentials()
        res = self._patch(self.s1, {"is_shortlisted": True})
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


# ── Rejection Prompt Tests ────────────────────────────────────────────────────

class RejectionPromptTests(APITestCase):

    def setUp(self):
        self.manager   = make_user("manager@test.com", role=Role.VP)
        acme           = make_client()
        job            = make_job(acme, self.manager)
        candidate      = make_candidate()
        self.submittal = make_submittal(candidate, job, self.manager)
        auth(self.client, self.manager)

    def _change_status(self, new_status, notes=""):
        url = reverse("submittal-change-status", args=[self.submittal.id])
        return self.client.post(url, {"status": new_status, "notes": notes}, format="json")

    def _make_rejection_template(self):
        return EmailTemplate.objects.create(
            name="Standard Rejection",
            template_type=EmailTemplate.TemplateType.REJECTION,
            subject="Thank you for your application",
            body="Unfortunately we will not be moving forward.",
        )

    def test_rejected_status_includes_prompt_when_template_exists(self):
        self._make_rejection_template()
        res = self._change_status("rejected")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data.get("rejection_template_available"))
        self.assertIn("candidate_email", res.data)
        self.assertIn("rejection_template_id", res.data)

    def test_withdrawn_status_includes_prompt_when_template_exists(self):
        self._make_rejection_template()
        res = self._change_status("withdrawn")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data.get("rejection_template_available"))

    def test_placed_status_does_not_include_prompt(self):
        self._make_rejection_template()
        res = self._change_status("placed")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertNotIn("rejection_template_available", res.data)

    def test_rejected_without_template_does_not_include_prompt(self):
        # No rejection template in DB — flag must be absent
        res = self._change_status("rejected")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertNotIn("rejection_template_available", res.data)

    def test_unauthenticated_returns_401(self):
        self.client.credentials()
        url = reverse("submittal-change-status", args=[self.submittal.id])
        res = self.client.post(url, {"status": "rejected"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


# ── Match Score Tests ─────────────────────────────────────────────────────────

class MatchScoreTests(APITestCase):

    def setUp(self):
        self.recruiter = make_user("recruiter@test.com")
        self.manager   = make_user("manager@test.com", role=Role.VP)
        auth(self.client, self.recruiter)
        self.acme = make_client()

    def _job_with_salary(self, requirements=""):
        job = Job.objects.create(
            title="Dev", client=self.acme, status="open", created_by=self.manager,
            requirements=requirements,
            salary_min=50000, salary_max=70000,
        )
        PipelineStage.objects.create(job=job, name="Screening", order=0)
        return job

    def _job_no_salary(self, requirements=""):
        job = Job.objects.create(
            title="Dev", client=self.acme, status="open", created_by=self.manager,
            requirements=requirements,
        )
        PipelineStage.objects.create(job=job, name="Screening", order=0)
        return job

    def _candidate_with_skills(self, *skill_names):
        candidate = make_candidate()
        for name in skill_names:
            tag, _ = SkillTag.objects.get_or_create(name=name)
            candidate.skills.add(tag)
        return candidate

    # ── Unit tests on the pure function ──────────────────────────────────────

    def test_full_skills_overlap_with_salary(self):
        job       = self._job_with_salary(requirements="python django rest")
        candidate = self._candidate_with_skills("python", "django")
        score = calculate_match_score(candidate, job)
        self.assertEqual(score, 100)   # 60 (all skills match) + 40 (salary defined)

    def test_partial_skills_overlap(self):
        job       = self._job_with_salary(requirements="python sql")
        candidate = self._candidate_with_skills("python", "java")  # 1 of 2 match
        score = calculate_match_score(candidate, job)
        # 1/2 * 60 = 30, + 40 salary = 70
        self.assertEqual(score, 70)

    def test_zero_skills_overlap_with_salary(self):
        job       = self._job_with_salary(requirements="python")
        candidate = self._candidate_with_skills("java")
        score = calculate_match_score(candidate, job)
        self.assertEqual(score, 40)   # 0 skills + 40 salary

    def test_zero_skills_no_salary(self):
        job       = self._job_no_salary(requirements="python")
        candidate = self._candidate_with_skills("java")
        score = calculate_match_score(candidate, job)
        self.assertEqual(score, 0)

    def test_no_candidate_skills_gives_only_salary(self):
        job       = self._job_with_salary(requirements="python")
        candidate = make_candidate()   # no skills
        score = calculate_match_score(candidate, job)
        self.assertEqual(score, 40)

    # ── Integration: score auto-set on submittal creation ────────────────────

    def test_create_submittal_auto_sets_match_score(self):
        job       = self._job_with_salary(requirements="python django")
        candidate = self._candidate_with_skills("python", "django")
        res = self.client.post(
            reverse("submittal-list"),
            {"candidate": candidate.id, "job": job.id},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["match_score"], 100)

    def test_patch_overrides_match_score(self):
        job       = self._job_no_salary()
        candidate = make_candidate()
        submittal = make_submittal(candidate, job, self.recruiter)
        res = self.client.patch(
            reverse("submittal-detail", args=[submittal.id]),
            {"match_score": 85},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["match_score"], 85)

    def test_ordering_by_match_score(self):
        job = self._job_no_salary()
        c1  = make_candidate(email="c1@x.com", phone="1001")
        c2  = make_candidate(email="c2@x.com", phone="1002")
        s1  = make_submittal(c1, job, self.recruiter)
        s2  = make_submittal(c2, job, self.recruiter)
        Submittal.objects.filter(pk=s1.pk).update(match_score=30)
        Submittal.objects.filter(pk=s2.pk).update(match_score=80)
        res = self.client.get(reverse("submittal-list"), {"ordering": "-match_score"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = [r["id"] for r in res.data["results"]]
        self.assertLess(ids.index(s2.id), ids.index(s1.id))
