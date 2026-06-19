# search/tests.py

from django.test import SimpleTestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .boolean_parser import _tokenize, has_boolean_operators, _ast_to_string, _Parser

from users.models import User, Role
from clients.models import Client
from candidates.models import Candidate
from jobs.models import Job, PipelineStage


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


def make_client_obj(name="Acme Corp", industry="Technology"):
    return Client.objects.create(name=name, industry=industry, status="active")


def make_candidate(first="Jane", last="Doe", email="jane@example.com",
                   phone="9000000001", title="", company="", created_by=None):
    return Candidate.objects.create(
        first_name=first, last_name=last,
        email=email, phone=phone,
        current_title=title, current_company=company,
        created_by=created_by,
    )


def make_job(client_obj, created_by, title="Backend Engineer", assigned_to=None):
    job = Job.objects.create(
        title=title, client=client_obj,
        status="open", created_by=created_by,
    )
    PipelineStage.objects.create(job=job, name="Screening", order=0)
    if assigned_to:
        job.assigned_to.set(assigned_to)
    return job


URL = reverse("search")


# ── Auth Tests ────────────────────────────────────────────────────────────────

class SearchAuthTests(APITestCase):

    def test_unauthenticated_rejected(self):
        res = self.client.get(URL, {"q": "python"})
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_recruiter_can_search(self):
        user = make_user("rec@test.com")
        auth(self.client, user)
        res = self.client.get(URL, {"q": "python"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)


# ── Empty Query Tests ─────────────────────────────────────────────────────────

class SearchEmptyQueryTests(APITestCase):

    def setUp(self):
        self.user = make_user("rec@test.com")
        auth(self.client, self.user)

    def test_missing_q_returns_empty(self):
        res = self.client.get(URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["candidates"], [])
        self.assertEqual(res.data["jobs"],       [])
        self.assertEqual(res.data["clients"],    [])

    def test_blank_q_returns_empty(self):
        res = self.client.get(URL, {"q": "  "})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["candidates"], [])

    def test_response_always_has_all_three_keys(self):
        res = self.client.get(URL, {"q": "something"})
        self.assertIn("candidates", res.data)
        self.assertIn("jobs",       res.data)
        self.assertIn("clients",    res.data)


# ── Candidate Search Tests ────────────────────────────────────────────────────

class CandidateSearchTests(APITestCase):

    def setUp(self):
        self.user = make_user("rec@test.com")
        auth(self.client, self.user)

        # Both candidates owned by self.user so the recruiter can see them
        self.alice = make_candidate(
            first="Alice", last="Smith",
            email="alice@example.com", phone="9001",
            title="Python Developer", company="TechCorp",
            created_by=self.user,
        )
        self.bob = make_candidate(
            first="Bob", last="Jones",
            email="bob@example.com", phone="9002",
            title="Java Engineer", company="JavaHouse",
            created_by=self.user,
        )

    def test_search_by_first_name(self):
        res = self.client.get(URL, {"q": "Alice"})
        ids = [c["id"] for c in res.data["candidates"]]
        self.assertIn(self.alice.id, ids)
        self.assertNotIn(self.bob.id, ids)

    def test_search_by_last_name(self):
        res = self.client.get(URL, {"q": "Jones"})
        ids = [c["id"] for c in res.data["candidates"]]
        self.assertIn(self.bob.id, ids)
        self.assertNotIn(self.alice.id, ids)

    def test_search_by_job_title(self):
        res = self.client.get(URL, {"q": "Python Developer"})
        ids = [c["id"] for c in res.data["candidates"]]
        self.assertIn(self.alice.id, ids)

    def test_search_by_company(self):
        res = self.client.get(URL, {"q": "TechCorp"})
        ids = [c["id"] for c in res.data["candidates"]]
        self.assertIn(self.alice.id, ids)

    def test_no_match_returns_empty_list(self):
        res = self.client.get(URL, {"q": "xyznonexistent"})
        self.assertEqual(res.data["candidates"], [])

    def test_result_has_expected_fields(self):
        res = self.client.get(URL, {"q": "Alice"})
        result = res.data["candidates"][0]
        for field in ("id", "full_name", "email", "current_title", "status"):
            self.assertIn(field, result)

    def test_full_name_is_combined(self):
        res = self.client.get(URL, {"q": "Alice"})
        self.assertEqual(res.data["candidates"][0]["full_name"], "Alice Smith")


# ── Job Search Tests ──────────────────────────────────────────────────────────

class JobSearchTests(APITestCase):

    def setUp(self):
        self.user    = make_user("rec@test.com")
        self.manager = make_user("mgr@test.com", role=Role.VP)
        # Search as manager — AM sees all jobs regardless of assignment
        auth(self.client, self.manager)
        acme = make_client_obj("Acme Corp")
        beta = make_client_obj("Beta Inc")

        self.django_job = make_job(acme, self.manager, title="Django Backend Engineer")
        self.react_job  = make_job(beta, self.manager, title="React Frontend Developer")

    def test_search_by_job_title(self):
        res = self.client.get(URL, {"q": "Django"})
        ids = [j["id"] for j in res.data["jobs"]]
        self.assertIn(self.django_job.id, ids)
        self.assertNotIn(self.react_job.id, ids)

    def test_result_includes_client_name(self):
        res = self.client.get(URL, {"q": "Django"})
        self.assertEqual(res.data["jobs"][0]["client_name"], "Acme Corp")

    def test_result_has_expected_fields(self):
        res = self.client.get(URL, {"q": "Django"})
        result = res.data["jobs"][0]
        for field in ("id", "title", "client_name", "status", "priority"):
            self.assertIn(field, result)


# ── Client Search Tests ───────────────────────────────────────────────────────

class ClientSearchTests(APITestCase):

    def setUp(self):
        self.manager = make_user("mgr@test.com", role=Role.VP)
        # Search as manager — recruiters/TL get empty client results
        auth(self.client, self.manager)
        self.acme    = make_client_obj("Acme Corp",   "Technology")
        self.fintech = make_client_obj("FinBank Ltd", "Finance")

    def test_search_by_client_name(self):
        res = self.client.get(URL, {"q": "Acme"})
        ids = [c["id"] for c in res.data["clients"]]
        self.assertIn(self.acme.id, ids)
        self.assertNotIn(self.fintech.id, ids)

    def test_search_by_industry(self):
        res = self.client.get(URL, {"q": "Finance"})
        ids = [c["id"] for c in res.data["clients"]]
        self.assertIn(self.fintech.id, ids)


# ── Type Filter Tests ─────────────────────────────────────────────────────────

class SearchTypeFilterTests(APITestCase):

    def setUp(self):
        self.user    = make_user("rec@test.com")
        self.manager = make_user("mgr@test.com", role=Role.VP)
        # Search as manager so all three entity types are visible
        auth(self.client, self.manager)
        acme = make_client_obj("Engineer Corp")
        make_candidate(first="Engineer", last="Doe",
                       email="eng@example.com", phone="9003", title="Engineer",
                       created_by=self.manager)
        make_job(acme, self.manager, title="Engineering Manager")

    def test_type_candidates_returns_only_candidates(self):
        res = self.client.get(URL, {"q": "Engineer", "type": "candidates"})
        self.assertTrue(len(res.data["candidates"]) > 0)
        self.assertEqual(res.data["jobs"],    [])
        self.assertEqual(res.data["clients"], [])

    def test_type_jobs_returns_only_jobs(self):
        res = self.client.get(URL, {"q": "Engineer", "type": "jobs"})
        self.assertTrue(len(res.data["jobs"]) > 0)
        self.assertEqual(res.data["candidates"], [])
        self.assertEqual(res.data["clients"],    [])

    def test_type_clients_returns_only_clients(self):
        res = self.client.get(URL, {"q": "Engineer", "type": "clients"})
        self.assertTrue(len(res.data["clients"]) > 0)
        self.assertEqual(res.data["candidates"], [])
        self.assertEqual(res.data["jobs"],       [])


# ── Search Isolation Tests ────────────────────────────────────────────────────

class SearchIsolationTests(APITestCase):
    """Verify search results are scoped by role per issue #27 Slice 6."""

    def setUp(self):
        self.recruiter_a = make_user("rec_a@iso.com", role=Role.RECRUITER)
        self.recruiter_b = make_user("rec_b@iso.com", role=Role.RECRUITER)
        self.team_lead   = make_user("tl@iso.com",    role=Role.TEAM_LEAD)
        self.manager     = make_user("mgr@iso.com",   role=Role.VP)

        # recruiter_b reports to team_lead — they are in the TL's pod
        self.recruiter_b.reports_to = self.team_lead
        self.recruiter_b.save(update_fields=["reports_to"])

        client_obj = make_client_obj("IsoClient Corp", "Tech")

        self.alice = make_candidate(
            first="Alice", last="IsoTest",
            email="alice_iso@test.com", phone="7001",
            title="Python Developer", created_by=self.recruiter_a,
        )
        self.bob = make_candidate(
            first="Bob", last="IsoTest",
            email="bob_iso@test.com", phone="7002",
            title="Python Developer", created_by=self.recruiter_b,
        )

        self.job_a = make_job(client_obj, self.manager, title="Python Senior Dev",
                              assigned_to=[self.recruiter_a])
        self.job_b = make_job(client_obj, self.manager, title="Python Junior Dev",
                              assigned_to=[self.recruiter_b])

    def test_recruiter_sees_own_candidates_only(self):
        auth(self.client, self.recruiter_a)
        res = self.client.get(URL, {"q": "IsoTest"})
        ids = [c["id"] for c in res.data["candidates"]]
        self.assertIn(self.alice.id, ids)
        self.assertNotIn(self.bob.id, ids)

    def test_recruiter_cannot_see_other_recruiter_candidate(self):
        auth(self.client, self.recruiter_b)
        res = self.client.get(URL, {"q": "IsoTest"})
        ids = [c["id"] for c in res.data["candidates"]]
        self.assertIn(self.bob.id, ids)
        self.assertNotIn(self.alice.id, ids)

    def test_recruiter_sees_assigned_jobs_only(self):
        auth(self.client, self.recruiter_a)
        res = self.client.get(URL, {"q": "Python"})
        ids = [j["id"] for j in res.data["jobs"]]
        self.assertIn(self.job_a.id, ids)
        self.assertNotIn(self.job_b.id, ids)

    def test_recruiter_gets_empty_client_results(self):
        auth(self.client, self.recruiter_a)
        res = self.client.get(URL, {"q": "IsoClient"})
        self.assertEqual(res.data["clients"], [])

    def test_team_lead_sees_own_and_pod_candidates(self):
        auth(self.client, self.team_lead)
        res = self.client.get(URL, {"q": "IsoTest"})
        ids = [c["id"] for c in res.data["candidates"]]
        self.assertIn(self.bob.id, ids)       # pod member's candidate
        self.assertNotIn(self.alice.id, ids)  # outside pod

    def test_team_lead_sees_pod_jobs(self):
        auth(self.client, self.team_lead)
        res = self.client.get(URL, {"q": "Python"})
        ids = [j["id"] for j in res.data["jobs"]]
        self.assertIn(self.job_b.id, ids)       # assigned to pod member
        self.assertNotIn(self.job_a.id, ids)    # outside pod

    def test_team_lead_gets_empty_client_results(self):
        auth(self.client, self.team_lead)
        res = self.client.get(URL, {"q": "IsoClient"})
        self.assertEqual(res.data["clients"], [])

    def test_manager_sees_all_candidates(self):
        auth(self.client, self.manager)
        res = self.client.get(URL, {"q": "IsoTest"})
        ids = [c["id"] for c in res.data["candidates"]]
        self.assertIn(self.alice.id, ids)
        self.assertIn(self.bob.id, ids)

    def test_manager_sees_all_jobs(self):
        auth(self.client, self.manager)
        res = self.client.get(URL, {"q": "Python"})
        ids = [j["id"] for j in res.data["jobs"]]
        self.assertIn(self.job_a.id, ids)
        self.assertIn(self.job_b.id, ids)

    def test_manager_sees_client_results(self):
        auth(self.client, self.manager)
        res = self.client.get(URL, {"q": "IsoClient"})
        self.assertTrue(len(res.data["clients"]) > 0)


# ── Boolean Parser Unit Tests (no DB) ────────────────────────────────────────

def _parse_to_str(query: str) -> str:
    tokens = _tokenize(query)
    ast    = _Parser(tokens).parse()
    return _ast_to_string(ast)


class BooleanParserTests(SimpleTestCase):

    def test_single_term(self):
        self.assertEqual(_parse_to_str("python"), "python")

    def test_explicit_and(self):
        self.assertEqual(_parse_to_str("python AND react"), "python AND react")

    def test_explicit_or(self):
        self.assertIn("OR", _parse_to_str("python OR react"))

    def test_not_term(self):
        self.assertEqual(_parse_to_str("NOT contractor"), "NOT contractor")

    def test_and_not(self):
        result = _parse_to_str("python AND NOT contractor")
        self.assertIn("python", result)
        self.assertIn("NOT contractor", result)

    def test_nested_parentheses(self):
        result = _parse_to_str("python AND (react OR vue)")
        self.assertIn("python", result)
        self.assertIn("react", result)
        self.assertIn("vue", result)

    def test_case_insensitive_operators(self):
        result_lower = _parse_to_str("python and react")
        result_upper = _parse_to_str("python AND react")
        self.assertEqual(result_lower, result_upper)

    def test_implicit_and_between_adjacent_terms(self):
        result = _parse_to_str("python react")
        self.assertIn("python", result)
        self.assertIn("react", result)
        self.assertIn("AND", result)

    def test_has_boolean_operators_detects_and(self):
        self.assertTrue(has_boolean_operators("python AND react"))

    def test_has_boolean_operators_false_for_plain_query(self):
        self.assertFalse(has_boolean_operators("python developer"))

    def test_has_boolean_operators_detects_not(self):
        self.assertTrue(has_boolean_operators("python NOT contractor"))

    def test_has_boolean_operators_detects_parens(self):
        self.assertTrue(has_boolean_operators("(python OR react)"))


# ── Boolean Search Integration Tests ─────────────────────────────────────────

class BooleanSearchIntegrationTests(APITestCase):

    def setUp(self):
        self.user  = make_user("bool@test.com")
        auth(self.client, self.user)
        self.alice = make_candidate(
            first="Alice", last="Dev",
            email="adev@bool.com", phone="8100",
            title="Python Developer", company="TechCo",
            created_by=self.user,
        )
        self.bob = make_candidate(
            first="Bob", last="Contractor",
            email="bcon@bool.com", phone="8101",
            title="Contractor Python",
            created_by=self.user,
        )

    def test_response_includes_parsed_query_for_boolean_input(self):
        res = self.client.get(URL, {"q": "Alice AND Dev"})
        self.assertEqual(res.status_code, 200)
        self.assertIn("parsed_query", res.data)
        self.assertIsNotNone(res.data["parsed_query"])

    def test_parsed_query_is_none_for_plain_input(self):
        res = self.client.get(URL, {"q": "Alice"})
        self.assertIsNone(res.data["parsed_query"])

    def test_empty_query_parsed_query_is_none(self):
        res = self.client.get(URL)
        self.assertIsNone(res.data["parsed_query"])

    def test_and_narrows_to_matching_candidates(self):
        res = self.client.get(URL, {"q": "Alice AND Developer"})
        self.assertEqual(res.status_code, 200)
        ids = [c["id"] for c in res.data["candidates"]]
        self.assertIn(self.alice.id, ids)
