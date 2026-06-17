from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Task

User = get_user_model()


class TaskSerializer(serializers.ModelSerializer):
    # Defaults to the requesting user if not supplied
    assignee = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        required=False,
        default=serializers.CurrentUserDefault(),
    )
    assignee_name  = serializers.StringRelatedField(source="assignee", read_only=True)
    candidate_name = serializers.SerializerMethodField()
    job_title      = serializers.CharField(source="related_job.title", read_only=True, default=None)

    class Meta:
        model  = Task
        fields = [
            "id", "title", "due_date", "status",
            "assignee", "assignee_name",
            "related_candidate", "candidate_name",
            "related_job", "job_title",
            "notified_at", "created_at", "updated_at",
        ]
        read_only_fields = ["notified_at", "created_at", "updated_at"]

    def get_candidate_name(self, obj):
        if obj.related_candidate:
            return f"{obj.related_candidate.first_name} {obj.related_candidate.last_name}"
        return None

    def create(self, validated_data):
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)
