from django.db.models import OuterRef, Subquery

from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response

from communications.models import EmailTemplate, SentEmail
from .models import Submittal, SubmittalEvent, calculate_match_score
from .serializers import (
    SubmittalSerializer,
    StageAdvanceSerializer,
    NoteSerializer,
    StatusChangeSerializer,
)
from users.permissions import IsRecruiterOrAbove, IsVPOrAbove
from users.mixins import RoleQuerysetMixin
from notifications.utils import notify


class SubmittalViewSet(RoleQuerysetMixin, viewsets.ModelViewSet):
    serializer_class = SubmittalSerializer
    filter_backends  = [filters.OrderingFilter]
    ordering_fields  = ["created_at", "status", "match_score"]
    ordering         = ["-created_at"]

    # Disable PUT — partial updates via PATCH only, and only for cover_note
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        last_email = (
            SentEmail.objects
            .filter(related_candidate=OuterRef("candidate"))
            .order_by("-sent_at")
            .values("sent_at")[:1]
        )
        qs = Submittal.objects.select_related(
            "candidate", "job", "current_stage", "submitted_by"
        ).prefetch_related(
            "events__from_stage", "events__to_stage", "events__created_by"
        ).annotate(candidate_last_contacted_at=Subquery(last_email))

        # Filter by job or candidate via query params — e.g. ?job=3 or ?candidate=7
        job_id       = self.request.query_params.get("job")
        candidate_id = self.request.query_params.get("candidate")
        status_param = self.request.query_params.get("status")

        if job_id:
            qs = qs.filter(job_id=job_id)
        if candidate_id:
            qs = qs.filter(candidate_id=candidate_id)
        if status_param:
            qs = qs.filter(status=status_param)
        if self.request.query_params.get("shortlisted") == "true":
            qs = qs.filter(is_shortlisted=True)

        allowed = self.allowed_author_ids()
        if allowed is not None:
            qs = qs.filter(submitted_by__in=allowed)

        return qs

    def get_permissions(self):
        # Recruiters can create submittals and add notes
        # Managers control status changes and deletions
        if self.action in ("destroy", "change_status"):
            return [IsVPOrAbove()]
        return [IsRecruiterOrAbove()]

    def perform_create(self, serializer):
        candidate = serializer.validated_data["candidate"]
        job       = serializer.validated_data["job"]
        serializer.save(match_score=calculate_match_score(candidate, job))

    @action(detail=True, methods=["post"], url_path="advance")
    def advance(self, request, pk=None):
        """
        POST /submittals/{id}/advance/
        Body: {"stage_id": 3, "notes": "Passed phone screen"}
        Moves the candidate to a new pipeline stage and writes an immutable event.
        """
        submittal = self.get_object()

        # Pass the submittal into serializer context so stage ownership can be validated
        serializer = StageAdvanceSerializer(
            data=request.data,
            context={"submittal": submittal, "request": request},
        )
        serializer.is_valid(raise_exception=True)

        # Stage was cached in context by StageAdvanceSerializer.validate_stage_id
        new_stage = serializer.context["stage"]

        # Write the immutable event before updating the submittal
        SubmittalEvent.objects.create(
            submittal  = submittal,
            event_type = SubmittalEvent.EventType.STAGE_CHANGE,
            from_stage = submittal.current_stage,   # null if this is the first advance
            to_stage   = new_stage,
            notes      = serializer.validated_data["notes"],
            created_by = request.user,
        )

        # Update the live stage pointer on the submittal
        submittal.current_stage = new_stage
        submittal.save(update_fields=["current_stage", "updated_at"])

        candidate = submittal.candidate
        notify(
            recipient=submittal.submitted_by,
            message=f"{candidate.first_name} {candidate.last_name} advanced to '{new_stage.name}' for {submittal.job.title}",
            candidate=candidate,
        )

        return Response(SubmittalSerializer(submittal, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="add-note")
    def add_note(self, request, pk=None):
        """
        POST /submittals/{id}/add-note/
        Body: {"notes": "Client loved the CV"}
        Appends a freetext note to the event log without changing stage or status.
        """
        submittal = self.get_object()
        serializer = NoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        SubmittalEvent.objects.create(
            submittal  = submittal,
            event_type = SubmittalEvent.EventType.NOTE,
            notes      = serializer.validated_data["notes"],
            created_by = request.user,
        )

        return Response(SubmittalSerializer(submittal, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="change-status",
            permission_classes=[IsVPOrAbove])
    def change_status(self, request, pk=None):
        """
        POST /submittals/{id}/change-status/
        Body: {"status": "rejected", "notes": "Salary mismatch"}
        Managers only — closes or places a submittal and logs the reason.
        """
        submittal = self.get_object()
        serializer = StatusChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data["status"]

        # Write the event first — always log before mutating state
        SubmittalEvent.objects.create(
            submittal  = submittal,
            event_type = SubmittalEvent.EventType.STATUS_CHANGE,
            notes      = f"{submittal.status} → {new_status}. {serializer.validated_data['notes']}".strip(". "),
            created_by = request.user,
        )

        submittal.status = new_status
        submittal.save(update_fields=["status", "updated_at"])

        response_data = SubmittalSerializer(submittal, context={"request": request}).data

        # Hint the frontend to offer a rejection email when closing negatively
        if new_status in ("rejected", "withdrawn"):
            rejection_template = EmailTemplate.objects.filter(
                template_type=EmailTemplate.TemplateType.REJECTION
            ).first()
            if rejection_template:
                return Response({
                    **response_data,
                    "rejection_template_available": True,
                    "rejection_template_id":        rejection_template.id,
                    "candidate_email":              submittal.candidate.email,
                })

        return Response(response_data)