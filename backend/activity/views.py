from rest_framework import viewsets, filters
from rest_framework.mixins import ListModelMixin, RetrieveModelMixin
from rest_framework.viewsets import GenericViewSet
from rest_framework import serializers

from .models import ActivityLog
from users.permissions import IsAccountManagerOrAbove


class ActivityLogSerializer(serializers.ModelSerializer):
    # Show username alongside the FK id — avoids a second user lookup in the frontend
    user = serializers.StringRelatedField(read_only=True)

    class Meta:
        model  = ActivityLog
        fields = [
            "id", "user", "action", "method",
            "endpoint", "model_name", "object_id",
            "status_code", "ip_address", "created_at",
        ]
        # Every field is read-only — logs are never edited via API
        read_only_fields = fields


class ActivityLogViewSet(ListModelMixin, RetrieveModelMixin, GenericViewSet):
    """
    Read-only endpoint — managers can list and retrieve activity log entries.
    No create, update, or delete is exposed. Ever.
    """
    serializer_class   = ActivityLogSerializer
    permission_classes = [IsAccountManagerOrAbove]
    filter_backends    = [filters.SearchFilter, filters.OrderingFilter]
    search_fields      = ["user__username", "model_name", "endpoint", "object_id"]
    ordering_fields    = ["created_at", "model_name", "action"]
    ordering           = ["-created_at"]

    def get_queryset(self):
        qs = ActivityLog.objects.select_related("user")

        # Allow narrowing by any combination of these query params
        model_name = self.request.query_params.get("model")    # e.g. ?model=candidates
        action     = self.request.query_params.get("action")   # e.g. ?action=delete
        user_id    = self.request.query_params.get("user")     # e.g. ?user=3

        if model_name:
            qs = qs.filter(model_name=model_name)
        if action:
            qs = qs.filter(action=action)
        if user_id:
            qs = qs.filter(user_id=user_id)

        return qs
