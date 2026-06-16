from rest_framework import viewsets, filters, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Candidate, SkillTag
from .serializers import CandidateSerializer, SkillTagSerializer
from users.permissions import IsAccountManagerOrAbove, IsRecruiterOrAbove


def _check_duplicate(field, value, exclude_pk=None):
    """Return a 409 Response if a candidate with this field value already exists."""
    qs = Candidate.objects.filter(**{field: value})
    if exclude_pk:
        qs = qs.exclude(pk=exclude_pk)
    existing = qs.first()
    if existing:
        return Response(
            {
                "duplicate": {
                    "field":  field,
                    "id":     existing.id,
                    "name":   f"{existing.first_name} {existing.last_name}",
                    "status": existing.status,
                }
            },
            status=status.HTTP_409_CONFLICT,
        )
    return None

class SkillTagViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only — skills are created implicitly when posting a candidate.
    No one should be manually managing the skill list via API.
    """
    queryset = SkillTag.objects.all()
    serializer_class = SkillTagSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]


class CandidateViewSet(viewsets.ModelViewSet):
    serializer_class = CandidateSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["first_name", "last_name", "email", "phone", "current_title", "current_company"]
    ordering_fields = ["created_at", "last_name", "status"]
    ordering = ["-created_at"]

    def get_queryset(self):
        qs = Candidate.objects.select_related("created_by").prefetch_related("skills")

        # Allow filtering by status and source via query params e.g. ?status=active
        status = self.request.query_params.get("status")
        source = self.request.query_params.get("source")
        skill   = self.request.query_params.get("skill")   # e.g. ?skill=python

        if status:
            qs = qs.filter(status=status)
        if source:
            qs = qs.filter(source=source)
        if skill:
            qs = qs.filter(skills__name=skill.strip().lower())

        return qs

    def create(self, request, *args, **kwargs):
        email = request.data.get('email', '').strip()
        phone = request.data.get('phone', '').strip()
        if email:
            dup = _check_duplicate('email', email)
            if dup:
                return dup
        if phone:
            dup = _check_duplicate('phone', phone)
            if dup:
                return dup
        return super().create(request, *args, **kwargs)

    def get_permissions(self):
        if self.action == "destroy":
            return [IsAccountManagerOrAbove()]
        return [IsRecruiterOrAbove()]

    @action(detail=False, methods=["patch"], url_path="bulk-status")
    def bulk_status(self, request):
        """
        PATCH /candidates/bulk-status/
        Body: {"ids": [1, 2, 3], "status": "passive"}
        Updates status for all listed candidates in one query.
        """
        ids        = request.data.get("ids", [])
        new_status = request.data.get("status", "")

        valid_statuses = [s for s, _ in Candidate.Status.choices]
        if new_status not in valid_statuses:
            return Response(
                {"detail": f"Invalid status. Choose from: {', '.join(valid_statuses)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not ids or not isinstance(ids, list):
            return Response({"detail": "ids must be a non-empty list."}, status=status.HTTP_400_BAD_REQUEST)

        updated = Candidate.objects.filter(pk__in=ids).update(status=new_status)
        return Response({"updated": updated})

    @action(detail=True, methods=["post"], url_path="add-skill")
    def add_skill(self, request, pk=None):
        """
        POST /candidates/{id}/add-skill/  {"name": "python"}
        Adds a single skill without replacing the full skill set.
        """
        candidate = self.get_object()
        name = request.data.get("name", "").strip().lower()
        if not name:
            return Response({"detail": "Skill name is required."}, status=400)

        tag, _ = SkillTag.objects.get_or_create(name=name)
        candidate.skills.add(tag)
        return Response(CandidateSerializer(candidate, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="remove-skill")
    def remove_skill(self, request, pk=None):
        """
        POST /candidates/{id}/remove-skill/  {"name": "python"}
        Removes a single skill without touching the rest.
        """
        candidate = self.get_object()
        name = request.data.get("name", "").strip().lower()
        try:
            tag = SkillTag.objects.get(name=name)
            candidate.skills.remove(tag)
        except SkillTag.DoesNotExist:
            return Response({"detail": "Skill not found."}, status=404)
        return Response(CandidateSerializer(candidate, context={"request": request}).data)

