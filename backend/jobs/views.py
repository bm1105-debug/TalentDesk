from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Job, PipelineStage
from .serializers import JobSerializer, PipelineStageSerializer
from users.permissions import IsAccountManagerOrAbove, IsRecruiterOrAbove

class JobViewSet(viewsets.ModelViewSet):
    serializer_class = JobSerializer
    filter_backends  = [filters.SearchFilter, filters.OrderingFilter]
    search_fields    = ["title", "client__name", "location"]
    ordering_fields  = ["created_at", "target_date", "priority", "status"]
    ordering         = ["-created_at"]

    def get_queryset(self):
        qs = Job.objects.select_related("client", "created_by") \
                        .prefetch_related("stages", "assigned_to")

        # Allow filtering via query params — e.g. ?status=open&priority=urgent
        status_param   = self.request.query_params.get("status")
        priority_param = self.request.query_params.get("priority")
        client_param   = self.request.query_params.get("client")   # client ID
        assigned_param = self.request.query_params.get("assigned_to_me")  # "true"

        if status_param:
            qs = qs.filter(status=status_param)
        if priority_param:
            qs = qs.filter(priority=priority_param)
        if client_param:
            qs = qs.filter(client_id=client_param)
        if assigned_param == "true":
            # Recruiters can filter to only see jobs assigned to them
            qs = qs.filter(assigned_to=self.request.user)

        return qs

    def get_permissions(self):
        # Only managers and above can create, update, or delete jobs
        # Recruiters can read — they need to see what they're working on
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAccountManagerOrAbove()]
        return [IsRecruiterOrAbove()]

    @action(detail=True, methods=["post"], url_path="reorder-stages")
    def reorder_stages(self, request, pk=None):
        """
        POST /jobs/{id}/reorder-stages/
        Body: {"stages": [{"id": 3, "order": 0}, {"id": 1, "order": 1}, ...]}
        Lets a manager reorder or rename pipeline stages without recreating them.
        """
        job = self.get_object()
        stages_data = request.data.get("stages", [])

        if not stages_data:
            return Response({"detail": "stages list is required."}, status=400)

        # Validate all stage IDs belong to this job before touching the DB
        stage_ids = [s["id"] for s in stages_data]
        existing  = set(job.stages.values_list("id", flat=True))
        if not set(stage_ids).issubset(existing):
            return Response({"detail": "One or more stage IDs do not belong to this job."}, status=400)

        # Two-phase update avoids unique constraint violations when stages swap positions.
        # Phase 1: shift all affected stages to temporary high values out of the real range
        offset = job.stages.count() + 1000
        for stage_data in stages_data:
            PipelineStage.objects.filter(id=stage_data["id"], job=job).update(
                order=stage_data["order"] + offset
            )
        # Phase 2: set the real final values now that the collision is gone
        for stage_data in stages_data:
            PipelineStage.objects.filter(id=stage_data["id"], job=job).update(
                order=stage_data["order"]
            )

        serializer = JobSerializer(job, context={"request": request})
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="assign")
    def assign(self, request, pk=None):
        """
        POST /jobs/{id}/assign/
        Body: {"user_id": 5}
        Adds a single recruiter to the job without replacing the full assigned list.
        """
        job = self.get_object()
        user_id = request.data.get("user_id")
        if not user_id:
            return Response({"detail": "user_id is required."}, status=400)

        # Import here to avoid circular imports between jobs and users apps
        from users.models import User
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=404)

        job.assigned_to.add(user)
        return Response(JobSerializer(job, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="unassign")
    def unassign(self, request, pk=None):
        """
        POST /jobs/{id}/unassign/
        Body: {"user_id": 5}
        Removes a recruiter from the job.
        """
        job = self.get_object()
        user_id = request.data.get("user_id")
        if not user_id:
            return Response({"detail": "user_id is required."}, status=400)

        from users.models import User
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=404)

        job.assigned_to.remove(user)
        return Response(JobSerializer(job, context={"request": request}).data)
