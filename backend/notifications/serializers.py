from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    candidate_name = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = ["id", "message", "candidate", "candidate_name", "is_read", "created_at"]
        read_only_fields = ["id", "message", "candidate", "candidate_name", "created_at"]

    def get_candidate_name(self, obj):
        if obj.candidate:
            return f"{obj.candidate.first_name} {obj.candidate.last_name}"
        return None
