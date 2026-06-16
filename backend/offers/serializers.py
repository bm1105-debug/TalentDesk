# offers/serializers.py

from rest_framework import serializers
from .models import Offer


class OfferSerializer(serializers.ModelSerializer):
    # Read-only denormalized fields so the frontend avoids extra lookups
    candidate_name  = serializers.SerializerMethodField()
    job_title       = serializers.SerializerMethodField()
    client_name     = serializers.SerializerMethodField()
    created_by_name = serializers.StringRelatedField(source="created_by", read_only=True)

    class Meta:
        model  = Offer
        fields = [
            "id", "submittal",
            "candidate_name", "job_title", "client_name",
            "salary", "currency",
            "offer_date", "expiry_date", "start_date",
            "status", "notes",
            "created_by", "created_by_name",
            "created_at", "updated_at",
        ]
        read_only_fields = ["status", "created_by", "created_at", "updated_at"]

    def get_candidate_name(self, obj):
        c = obj.submittal.candidate
        return f"{c.first_name} {c.last_name}"

    def get_job_title(self, obj):
        return obj.submittal.job.title

    def get_client_name(self, obj):
        return obj.submittal.job.client.name

    def validate_submittal(self, submittal):
        # Block creating an offer on a non-active submittal
        if submittal.status != "active":
            raise serializers.ValidationError(
                "Can only create an offer on an active submittal."
            )
        # Block a second pending offer on the same submittal
        if Offer.objects.filter(submittal=submittal, status=Offer.Status.PENDING).exists():
            raise serializers.ValidationError(
                "This submittal already has a pending offer."
            )
        return submittal

    def create(self, validated_data):
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class OfferActionSerializer(serializers.Serializer):
    """Payload for accept / decline / withdraw actions."""
    notes = serializers.CharField(required=False, allow_blank=True, default="")
