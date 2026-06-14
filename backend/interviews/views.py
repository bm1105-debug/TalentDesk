'''
Defines the CRUD endpoint for interviews plus a dedicated update-status action. 
Recruiters can create and view interviews; managers can delete them. 
The update-status action keeps status transitions explicit 
and separate from general edits so they're clearly visible in the activity log.

'''

from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Interview
from .serializers import InterviewSerializer, InterviewStatusUpdateSerializer
from users.permissions import IsAccountManagerOrAbove, IsRecruiterOrAbove

class InterviewViewSet(viewsets.ModelViewSet):
    serializer_class  = InterviewSerializer
    filter_backends   = [filters.OrderingFilter]
    ordering_fields   = ["scheduled_at", "status", "created_at"]
    ordering          = ["scheduled_at"]   # next upcoming interview first

    # Disable PUT — use PATCH for partial updates only
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = Interview.objects.select_related(
            "submittal__candidate",
            "submittal__job",
            "interviewer",
            "created_by",
        )

        # Filter by submittal so the frontend can load all interviews
        # for one candidate+job pairing — e.g. ?submittal=5
        submittal_id   = self.request.query_params.get("submittal")
        status_param   = self.request.query_params.get("status")
        interview_type = self.request.query_params.get("type")

        if submittal_id:
            qs = qs.filter(submittal_id=submittal_id)
        if status_param:
            qs = qs.filter(status=status_param)
        if interview_type:
            qs = qs.filter(interview_type=interview_type)

        return qs

    def get_permissions(self):
        # Recruiters can schedule and view interviews
        # Only managers can delete interview records
        if self.action == "destroy":
            return [IsAccountManagerOrAbove()]
        return [IsRecruiterOrAbove()]

    @action(detail=True, methods=["post"], url_path="update-status")
    def update_status(self, request, pk=None):
        """
        POST /interviews/{id}/update-status/
        Body: {"status": "completed", "notes": "Strong technical skills"}

        Separates status transitions from general edits — a recruiter marking
        an interview as completed is a meaningful event, not just a field update.
        Notes added here are appended to the existing notes rather than replacing
        them, so the full feedback history is preserved.
        """
        interview = self.get_object()
        serializer = InterviewStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data["status"]
        new_notes  = serializer.validated_data["notes"]

        interview.status = new_status

        # Append new notes below existing ones rather than overwriting —
        # a panel interview may accumulate feedback from multiple reviewers
        if new_notes:
            separator = "\n\n---\n" if interview.notes else ""
            interview.notes = interview.notes + separator + new_notes

        interview.save(update_fields=["status", "notes", "updated_at"])

        return Response(InterviewSerializer(interview, context={"request": request}).data)
