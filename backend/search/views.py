from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import serializers

from django.contrib.postgres.search import SearchVector, SearchQuery, SearchRank

from candidates.models import Candidate
from jobs.models import Job
from clients.models import Client
from users.permissions import IsRecruiterOrAbove
from users.mixins import RoleQuerysetMixin
from .boolean_parser import has_boolean_operators, parse_boolean_query

# ── Lightweight result serializers ────────────────────────────────────────────

class CandidateResultSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model  = Candidate
        fields = ["id", "full_name", "email", "current_title", "current_company", "status"]

    def get_full_name(self, obj):
        return f"{obj.first_name} {obj.last_name}"


class JobResultSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.name", read_only=True)

    class Meta:
        model  = Job
        fields = ["id", "title", "client_name", "status", "priority", "location"]


class ClientResultSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Client
        fields = ["id", "name", "industry", "status"]


# ── Unified search view ───────────────────────────────────────────────────────

class SearchView(RoleQuerysetMixin, APIView):
    """
    GET /api/search/?q=...              → searches all three resource types
    GET /api/search/?q=...&type=jobs    → narrows to jobs only

    Results are scoped by role:
      Recruiter — own candidates, assigned jobs, no clients
      Team Lead — own + pod candidates, pod jobs, no clients
      AM / CEO  — all records, all clients
    """
    permission_classes = [IsRecruiterOrAbove]

    def get(self, request):
        query    = request.query_params.get("q", "").strip()
        res_type = request.query_params.get("type", "all").lower()

        if not query:
            return Response({"candidates": [], "jobs": [], "clients": [], "parsed_query": None})

        parsed_query_str = None
        if has_boolean_operators(query):
            search_query, parsed_query_str = parse_boolean_query(query)
            if search_query is None:
                search_query = SearchQuery(query, search_type="websearch")
        else:
            search_query = SearchQuery(query, search_type="websearch")

        # None → AM/CEO unrestricted; set → recruiter/TL pod scope
        allowed = self.allowed_author_ids()
        results = {"candidates": [], "jobs": [], "clients": [], "parsed_query": parsed_query_str}

        if res_type in ("all", "candidates"):
            vector = (
                SearchVector("first_name", "last_name",          weight="A") +
                SearchVector("current_title", "current_company", weight="B") +
                SearchVector("email",                            weight="C")
            )
            qs = Candidate.objects.annotate(
                rank=SearchRank(vector, search_query)
            ).filter(rank__gt=0).order_by("-rank")
            if allowed is not None:
                qs = qs.filter(created_by__in=allowed)
            results["candidates"] = CandidateResultSerializer(qs, many=True).data

        if res_type in ("all", "jobs"):
            vector = (
                SearchVector("title",                        weight="A") +
                SearchVector("description", "requirements", weight="B") +
                SearchVector("location",                    weight="C")
            )
            qs = Job.objects.select_related("client").annotate(
                rank=SearchRank(vector, search_query)
            ).filter(rank__gt=0).order_by("-rank")
            if allowed is not None:
                qs = qs.filter(assigned_to__in=allowed).distinct()
            results["jobs"] = JobResultSerializer(qs, many=True).data

        if res_type in ("all", "clients"):
            if allowed is not None:
                # Recruiters and Team Leads cannot browse full client profiles
                results["clients"] = []
            else:
                vector = (
                    SearchVector("name",     weight="A") +
                    SearchVector("industry", weight="B")
                )
                qs = Client.objects.annotate(
                    rank=SearchRank(vector, search_query)
                ).filter(rank__gt=0).order_by("-rank")
                results["clients"] = ClientResultSerializer(qs, many=True).data

        return Response(results)
