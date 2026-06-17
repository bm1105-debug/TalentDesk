from rest_framework import serializers
from .models import Submittal, SubmittalEvent
from jobs.models import PipelineStage


class SubmittalEventSerializer(serializers.ModelSerializer):
    # Show stage names instead of just IDs for readable timeline display
    from_stage_name = serializers.CharField(source="from_stage.name", read_only=True, default=None)
    to_stage_name   = serializers.CharField(source="to_stage.name",   read_only=True, default=None)

    # Show who performed the action
    created_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model  = SubmittalEvent
        fields = [
            "id", "event_type",
            "from_stage", "from_stage_name",
            "to_stage",   "to_stage_name",
            "notes", "created_by", "created_at",
        ]
        # Events are append-only — no field is writable through this serializer
        read_only_fields = fields


class SubmittalSerializer(serializers.ModelSerializer):
    # Read: full event timeline embedded in the submittal detail response
    events = SubmittalEventSerializer(many=True, read_only=True)

    # Annotated in get_queryset — most recent email date for this submittal's candidate
    candidate_last_contacted_at = serializers.DateTimeField(read_only=True, allow_null=True, default=None)

    # Read: human-readable names so the frontend doesn't need extra lookups
    candidate_name    = serializers.SerializerMethodField()
    job_title         = serializers.CharField(source="job.title",          read_only=True)
    current_stage_name = serializers.CharField(source="current_stage.name", read_only=True, default=None)
    submitted_by      = serializers.StringRelatedField(read_only=True)

    class Meta:
        model  = Submittal
        fields = [
            "id", "candidate", "candidate_name",
            "job", "job_title",
            "current_stage", "current_stage_name",
            "status", "cover_note", "is_shortlisted", "match_score",
            "submitted_by", "created_at", "updated_at",
            "candidate_last_contacted_at",
            "events",
        ]
        read_only_fields = [
            "submitted_by", "created_at", "updated_at",
            "current_stage",   # stage is only moved via advance action, never set directly
            "status",          # status is only changed via change-status action
        ]

    def get_candidate_name(self, obj):
        # Full name from candidate FK — avoids a separate candidate lookup in the frontend
        return f"{obj.candidate.first_name} {obj.candidate.last_name}"

    def create(self, validated_data):
        # Auto-assign the recruiter who is submitting the candidate
        validated_data["submitted_by"] = self.context["request"].user
        return super().create(validated_data)

    def validate(self, data):
        # Ensure the job and candidate exist together only once (belt-and-suspenders
        # on top of the DB unique_together constraint — gives a cleaner API error)
        job       = data.get("job")
        candidate = data.get("candidate")
        if job and candidate:
            if Submittal.objects.filter(job=job, candidate=candidate).exists():
                raise serializers.ValidationError(
                    "This candidate has already been submitted to this job."
                )
        return data


class StageAdvanceSerializer(serializers.Serializer):
    """
    Payload for POST /submittals/{id}/advance/
    Validates that the target stage belongs to the submittal's job.
    """
    stage_id = serializers.IntegerField()
    notes    = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_stage_id(self, value):
        # The view passes the submittal instance via context so we can check ownership
        submittal = self.context["submittal"]
        try:
            stage = PipelineStage.objects.get(id=value, job=submittal.job)
        except PipelineStage.DoesNotExist:
            raise serializers.ValidationError(
                "Stage does not exist or does not belong to this job."
            )
        self.context["stage"] = stage   # cache for the view to use
        return value


class NoteSerializer(serializers.Serializer):
    """Payload for POST /submittals/{id}/add-note/"""
    notes = serializers.CharField()   # required, must not be blank


class StatusChangeSerializer(serializers.Serializer):
    """Payload for POST /submittals/{id}/change-status/"""
    status = serializers.ChoiceField(choices=Submittal.SubmittalStatus.choices)
    notes  = serializers.CharField(required=False, allow_blank=True, default="")
