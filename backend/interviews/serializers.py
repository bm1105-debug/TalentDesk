'''
Defines how Interview objects are converted to/from JSON. 
Handles auto-setting created_by, validates that the interview's submittal is still active before scheduling, 
and ensures scheduled_at is not in the past.

'''

from django.utils import timezone
from rest_framework import serializers
from .models import Interview

class InterviewSerializer(serializers.ModelSerializer):

    # Read: show human-readable names so the frontend doesn't need extra lookups
    candidate_name = serializers.SerializerMethodField()
    job_title      = serializers.CharField(
        source="submittal.job.title", read_only=True
    )
    interviewer_name = serializers.StringRelatedField(
        source="interviewer", read_only=True
    )
    created_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model  = Interview
        fields = [
            "id",
            "submittal",
            "candidate_name", "job_title",      # read-only display fields
            "interview_type", "status",
            "scheduled_at", "duration_minutes",
            "meeting_link", "location",
            "interviewer", "interviewer_name",   # write id, read name
            "notes",
            "created_by", "created_at", "updated_at",
        ]
        read_only_fields = ["created_by", "created_at", "updated_at"]

    def get_candidate_name(self, obj):
        c = obj.submittal.candidate
        return f"{c.first_name} {c.last_name}"

    def validate_scheduled_at(self, value):
        # Prevent scheduling interviews in the past — catches data entry mistakes
        if value < timezone.now():
            raise serializers.ValidationError(
                "scheduled_at must be in the future."
            )
        return value

    def validate(self, data):
        # Only allow scheduling against active submittals —
        # a rejected or placed candidate should not be getting new interviews
        submittal = data.get("submittal") or getattr(self.instance, "submittal", None)
        if submittal and submittal.status != "active":
            raise serializers.ValidationError(
                f"Cannot schedule an interview for a submittal with status '{submittal.status}'."
            )
        return data

    def create(self, validated_data):
        # Stamp the recruiter who created the interview record
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class InterviewStatusUpdateSerializer(serializers.Serializer):
    """
    Payload for POST /interviews/{id}/update-status/
    Separates status changes from full updates so the transition
    is explicit and notes can be required when marking no-show or cancelled.
    """
    status = serializers.ChoiceField(choices=Interview.Status.choices)
    notes  = serializers.CharField(required=False, allow_blank=True, default="")