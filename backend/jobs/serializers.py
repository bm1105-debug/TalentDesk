from rest_framework import serializers
from .models import Job, PipelineStage, DEFAULT_PIPELINE


class PipelineStageSerializer(serializers.ModelSerializer):
    class Meta:
        model  = PipelineStage
        fields = ["id", "name", "order"]
        # job is set automatically from the URL/view — never sent by the client
        read_only_fields = ["id"]

class JobSerializer(serializers.ModelSerializer):
    # Read: return full stage objects in order so the frontend can render the pipeline
    stages = PipelineStageSerializer(many=True, read_only=True)

    # Read: show client name alongside the FK id so the frontend doesn't need a second call
    client_name = serializers.CharField(source="client.name", read_only=True)

    # Read: show assigned recruiter names for display
    assigned_to_names = serializers.StringRelatedField(
        many=True, source="assigned_to", read_only=True
    )

    # Write: accept a list of user IDs to assign recruiters
    assigned_to_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        write_only=True,
        required=False,
        source="assigned_to",
        queryset=__import__("users.models", fromlist=["User"]).User.objects.all(),
    )

    # Write: optionally override the default pipeline stages at creation time
    # e.g. ["Screening", "Final Interview", "Offer"] — skips the default if provided
    pipeline_stages = serializers.ListField(
        child=serializers.CharField(max_length=100),
        write_only=True,
        required=False,
    )

    # Show who created the job without exposing the full user object
    created_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model  = Job
        fields = [
            "id", "title", "client", "client_name",
            "description", "requirements", "location",
            "job_type", "status", "priority",
            "salary_min", "salary_max", "openings",
            "assigned_to_names", "assigned_to_ids",
            "target_date", "stages", "pipeline_stages",
            "created_by", "created_at", "updated_at",
        ]
        read_only_fields = ["created_by", "created_at", "updated_at"]

    def _create_pipeline(self, job, stage_names):
        # Bulk-create all stages in one query — order is the list index
        PipelineStage.objects.bulk_create([
            PipelineStage(job=job, name=name, order=i)
            for i, name in enumerate(stage_names)
        ])

    def validate(self, data):
        min_s = data.get("salary_min")
        max_s = data.get("salary_max")
        if min_s is not None and max_s is not None and min_s > max_s:
            raise serializers.ValidationError(
                {"salary_max": "salary_max must be greater than or equal to salary_min."}
            )
        return data

    def create(self, validated_data):
        # Pop write-only fields before passing to model
        stage_names = validated_data.pop("pipeline_stages", DEFAULT_PIPELINE)
        validated_data["created_by"] = self.context["request"].user
        job = super().create(validated_data)
        self._create_pipeline(job, stage_names)
        return job

    def update(self, instance, validated_data):
        # pipeline_stages is intentionally ignored on update —
        # stages are managed via the dedicated /reorder-stages/ action
        validated_data.pop("pipeline_stages", None)
        return super().update(instance, validated_data)