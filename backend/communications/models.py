from django.db import models
from django.conf import settings


class GeneratedEmail(models.Model):
    """AI-generated email record — stores up to 10 per user for history."""

    class Mode(models.TextChoices):
        SINGLE = "single", "Single"
        BULK   = "bulk",   "Bulk"

    user    = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="generated_emails",
    )
    mode    = models.CharField(max_length=10, choices=Mode.choices, default=Mode.SINGLE)
    purpose = models.CharField(max_length=500)
    tone    = models.CharField(max_length=20)
    length  = models.CharField(max_length=20)

    # Single mode output
    recipient = models.CharField(max_length=200, blank=True)
    subject   = models.CharField(max_length=500, blank=True)
    body      = models.TextField(blank=True)

    # Bulk mode output — list of {recipient, subject, body, error}
    bulk_results = models.JSONField(default=list, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
