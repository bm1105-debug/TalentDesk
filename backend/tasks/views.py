from rest_framework import viewsets, filters, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from users.models import Role
from users.mixins import RoleQuerysetMixin
from .models import Task
from .serializers import TaskSerializer


class TaskViewSet(RoleQuerysetMixin, viewsets.ModelViewSet):
    serializer_class   = TaskSerializer
    permission_classes = [IsAuthenticated]
    filter_backends    = [filters.OrderingFilter]
    ordering_fields    = ["due_date", "created_at"]
    ordering           = ["due_date", "created_at"]
    http_method_names  = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        allowed = self.allowed_author_ids()
        if allowed is not None:
            qs = Task.objects.filter(assignee__in=allowed).select_related(
                "assignee", "related_candidate", "related_job"
            )
        else:
            qs = Task.objects.select_related("assignee", "related_candidate", "related_job")

        status_param = self.request.query_params.get("status")
        candidate    = self.request.query_params.get("candidate")
        job          = self.request.query_params.get("job")
        assignee     = self.request.query_params.get("assignee")

        if status_param:
            qs = qs.filter(status=status_param)
        if candidate:
            qs = qs.filter(related_candidate_id=candidate)
        if job:
            qs = qs.filter(related_job_id=job)
        if assignee == "me":
            qs = qs.filter(assignee=self.request.user)

        return qs

    def destroy(self, request, *args, **kwargs):
        task = self.get_object()
        # Assignee, creator, or manager can delete
        can_delete = (
            task.assignee == request.user
            or task.created_by == request.user
            or request.user.role in (Role.VP, Role.CEO)
        )
        if not can_delete:
            return Response(status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        # Clear notified_at whenever a task is re-opened so it can be re-notified
        instance = self.get_object()
        new_status = request.data.get("status")
        if new_status == Task.Status.OPEN and instance.status == Task.Status.DONE:
            instance.notified_at = None
            instance.save(update_fields=["notified_at"])
        return super().partial_update(request, *args, **kwargs)
