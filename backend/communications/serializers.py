from rest_framework import serializers
from .models import GeneratedEmail


class GenerateEmailSerializer(serializers.Serializer):
    """Input payload for POST /api/communications/ai-generate/"""
    TONES   = ["Professional", "Friendly", "Formal", "Assertive"]
    LENGTHS = ["Concise", "Standard", "Detailed"]

    mode       = serializers.ChoiceField(choices=["single", "bulk"], default="single")
    purpose    = serializers.CharField(max_length=500)
    keypoints  = serializers.CharField(required=False, allow_blank=True, default="")
    tone       = serializers.ChoiceField(choices=TONES)
    length     = serializers.ChoiceField(choices=LENGTHS)

    # Single mode
    recipient  = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")

    # Bulk mode
    recipients = serializers.ListField(
        child=serializers.CharField(max_length=200),
        required=False,
        default=list,
    )

    # Refinement (single mode only)
    refine_instruction = serializers.CharField(required=False, allow_blank=True, default="")
    previous_email     = serializers.CharField(required=False, allow_blank=True, default="")

    # Set False when calling per-recipient in bulk mode so history isn't polluted
    save_history = serializers.BooleanField(required=False, default=True)


class GeneratedEmailSerializer(serializers.ModelSerializer):
    """Read-only serializer for AI email history."""
    class Meta:
        model  = GeneratedEmail
        fields = [
            "id", "mode", "purpose", "tone", "length",
            "recipient", "subject", "body", "bulk_results", "created_at",
        ]
        read_only_fields = fields
