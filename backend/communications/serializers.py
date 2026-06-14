'''
Defines serializers for template CRUD, a SendEmailSerializer that validates the send payload 
and renders {{ variables }} using Django's template engine, 
and a read-only serializer for the sent email log.

'''

from django.template import Template, Context
from django.template.exceptions import TemplateSyntaxError
from rest_framework import serializers

from .models import EmailTemplate, SentEmail


class EmailTemplateSerializer(serializers.ModelSerializer):
    """Full CRUD serializer for email templates."""
    created_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model  = EmailTemplate
        fields = [
            "id", "name", "template_type", "subject", "body",
            "available_variables", "created_by", "created_at", "updated_at",
        ]
        read_only_fields = ["created_by", "created_at", "updated_at"]

    def create(self, validated_data):
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class SendEmailSerializer(serializers.Serializer):
    """
    Payload for POST /api/communications/send/
    Renders the chosen template with the supplied context variables,
    sends via SMTP, and writes a SentEmail log entry.
    """
    template_id       = serializers.IntegerField()
    to_email          = serializers.EmailField()
    to_name           = serializers.CharField(max_length=200, required=False, default="")
    context           = serializers.DictField(
        child=serializers.CharField(),
        required=False,
        default=dict,
        # e.g. {"candidate_name": "Jane Doe", "job_title": "Backend Engineer"}
    )
    related_candidate = serializers.IntegerField(required=False, allow_null=True, default=None)
    related_job       = serializers.IntegerField(required=False, allow_null=True, default=None)

    def validate_template_id(self, value):
        # Confirm the template exists and cache it for use in the view
        try:
            template = EmailTemplate.objects.get(id=value)
        except EmailTemplate.DoesNotExist:
            raise serializers.ValidationError("Email template not found.")
        self.context["template_obj"] = template
        return value

    def validate(self, data):
        template = self.context.get("template_obj")
        if not template:
            return data

        ctx = data.get("context", {})

        # Render subject and body using Django's template engine —
        # safer than .format() because it doesn't expose Python internals
        try:
            rendered_subject = Template(template.subject).render(Context(ctx))
            rendered_body    = Template(template.body).render(Context(ctx))
        except TemplateSyntaxError as e:
            raise serializers.ValidationError(
                f"Template rendering failed: {e}"
            )

        # Cache rendered output so the view doesn't have to re-render
        self.context["rendered_subject"] = rendered_subject
        self.context["rendered_body"]    = rendered_body
        return data


class PreviewEmailSerializer(serializers.Serializer):
    """
    Payload for POST /api/communications/preview/
    Same as SendEmailSerializer but returns rendered output without sending.
    Lets recruiters check the email looks right before firing it off.
    """
    template_id = serializers.IntegerField()
    context     = serializers.DictField(
        child=serializers.CharField(),
        required=False,
        default=dict,
    )

    def validate_template_id(self, value):
        try:
            template = EmailTemplate.objects.get(id=value)
        except EmailTemplate.DoesNotExist:
            raise serializers.ValidationError("Email template not found.")
        self.context["template_obj"] = template
        return value

    def validate(self, data):
        template = self.context.get("template_obj")
        ctx      = data.get("context", {})
        try:
            self.context["rendered_subject"] = Template(template.subject).render(Context(ctx))
            self.context["rendered_body"]    = Template(template.body).render(Context(ctx))
        except TemplateSyntaxError as e:
            raise serializers.ValidationError(f"Template rendering failed: {e}")
        return data


class SentEmailSerializer(serializers.ModelSerializer):
    """Read-only serializer for the sent email audit log."""
    sent_by  = serializers.StringRelatedField(read_only=True)
    template = serializers.StringRelatedField(read_only=True)

    class Meta:
        model  = SentEmail
        fields = [
            "id", "template", "to_email", "to_name",
            "subject", "body", "status", "error_message",
            "related_candidate", "related_job",
            "sent_by", "sent_at",
        ]
        read_only_fields = fields   # every field is read-only
