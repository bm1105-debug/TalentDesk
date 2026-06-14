'''
 This is the entire brain of the search app. 
 It defines one API endpoint (GET /api/search/?q=...) that fires three PostgreSQL full-text queries in parallel 
 — one against candidates, one against jobs, one against clients — ranks results by relevance, and returns them grouped by type in a single response. 
 No models or serializers files are needed because we're reading from other apps' tables, not writing our own.

 '''

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import serializers

from django.contrib.postgres.search import SearchVector, SearchQuery, SearchRank

from candidates.models import Candidate
from jobs.models import Job
from clients.models import Client
from users.permissions import IsRecruiterOrAbove

# ── Lightweight result serializers ────────────────────────────────────────────
# We don't reuse the full serializers (they carry nested events, stages, etc.)
# Search result cards only need enough to identify and link to the record.

class CandidateResultSerializer(serializers.ModelSerializer):
    # Combine first + last name so the frontend doesn't have to
    full_name = serializers.SerializerMethodField()

    class Meta:
        model  = Candidate
        fields = ["id", "full_name", "email", "current_title", "current_company", "status"]

    def get_full_name(self, obj):
        return f"{obj.first_name} {obj.last_name}"


class JobResultSerializer(serializers.ModelSerializer):
    # Include client name so the result card shows "Backend Eng @ Acme Corp"
    client_name = serializers.CharField(source="client.name", read_only=True)

    class Meta:
        model  = Job
        fields = ["id", "title", "client_name", "status", "priority", "location"]


class ClientResultSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Client
        fields = ["id", "name", "industry", "status"]


# ── Unified search view ───────────────────────────────────────────────────────

class SearchView(APIView):
    """
    GET /api/search/?q=python developer        → searches all three resource types
    GET /api/search/?q=acme&type=clients       → narrows to clients only
    GET /api/search/?q=john&type=candidates    → narrows to candidates only
    """
    permission_classes = [IsRecruiterOrAbove]

    def get(self, request):
        query    = request.query_params.get("q", "").strip()
        res_type = request.query_params.get("type", "all").lower()

        # Return empty results immediately — don't full-scan all three tables for nothing
        if not query:
            return Response({"candidates": [], "jobs": [], "clients": []})

        # websearch mode: supports "quoted phrases", -exclusions, OR operators
        # Same syntax recruiters already know from Google search
        search_query = SearchQuery(query, search_type="websearch")

        results = {"candidates": [], "jobs": [], "clients": []}

        if res_type in ("all", "candidates"):
            # Weight A = highest relevance boost, C = lowest
            # A match in the name ranks higher than one buried in the email
            vector = (
                SearchVector("first_name", "last_name",          weight="A") +
                SearchVector("current_title", "current_company", weight="B") +
                SearchVector("email",                            weight="C")
            )
            qs = Candidate.objects.annotate(
                rank=SearchRank(vector, search_query)
            ).filter(rank__gt=0).order_by("-rank")

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

            results["jobs"] = JobResultSerializer(qs, many=True).data

        if res_type in ("all", "clients"):
            vector = (
                SearchVector("name",     weight="A") +
                SearchVector("industry", weight="B")
            )
            qs = Client.objects.annotate(
                rank=SearchRank(vector, search_query)
            ).filter(rank__gt=0).order_by("-rank")

            results["clients"] = ClientResultSerializer(qs, many=True).data

        return Response(results)