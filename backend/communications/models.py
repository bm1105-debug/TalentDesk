'''
Defines two models — EmailTemplate (reusable templates with {{variable}} placeholders) 
and SentEmail (an immutable audit log of every email sent, 
storing the rendered subject and body so we always know exactly what was delivered).

'''

from django.db import models
from django.conf import settings
from candidates.models import Candidate
from jobs.models import Job


class EmailTemplate(models.Model):
    """
    Reusable email template with Django-style {{ variable }} placeholders.
    Recruiters pick a template, fill in the context, and fire it off.
    """

    class TemplateType(models.TextChoices):
        INTRO         = "intro",         "Candidate Introduction"   # first contact
        INTERVIEW     = "interview",     "Interview Invitation"     # scheduling
        REJECTION     = "rejection",     "Rejection"                # didn't get the role
        OFFER         = "offer",         "Offer Letter"             # placed
        FOLLOW_UP     = "follow_up",     "Follow Up"                # chasing a response
        CUSTOM        = "custom",        "Custom"                   # one-off template

    name          = models.CharField(max_length=200, unique=True)  # e.g. "Standard Intro Email"
    template_type = models.CharField(max_length=20, choices=TemplateType.choices)
    subject       = models.CharField(max_length=500)   # supports {{ variables }}
    body          = models.TextField()                  # HTML or plain text with {{ variables }}

    # Common variables: {{ candidate_name }}, {{ job_title }}, {{ company_name }},
    # {{ interview_date }}, {{ meeting_link }}, {{ recruiter_name }}
    # Stored as a help text field so recruiters know what to pass
    available_variables = models.TextField(
        blank=True,
        help_text="Comma-separated list of variable names this template expects."
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, on_delete=models.SET_NULL,
        related_name="email_templates_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.template_type})"

    class Meta:
        ordering = ["template_type", "name"]


class SentEmail(models.Model):
    """
    Append-only log of every email dispatched through the system.
    Stores the RENDERED subject and body — not just the template ID —
    so we always know exactly what was sent even if the template changes later.
    """

    class SendStatus(models.TextChoices):
        SENT   = "sent",   "Sent"    # SMTP accepted the message
        FAILED = "failed", "Failed"  # SMTP rejected or threw an exception

    # Which template was used — nullable because emails can be sent without a template
    template = models.ForeignKey(
        EmailTemplate,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="sent_emails",
    )

    # Recipient details captured at send time — not FK so changing a
    # candidate's email doesn't silently alter the historical record
    to_email = models.EmailField()
    to_name  = models.CharField(max_length=200, blank=True)

    # The fully rendered content that was actually delivered
    subject  = models.CharField(max_length=500)
    body     = models.TextField()

    # Optional links back to the ATS records this email was about
    related_candidate = models.ForeignKey(
        Candidate,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="emails_received",
    )
    related_job = models.ForeignKey(
        Job,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="emails_sent",
    )

    status        = models.CharField(max_length=10, choices=SendStatus.choices, default=SendStatus.SENT)
    error_message = models.TextField(blank=True)  # populated if status=failed

    sent_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, on_delete=models.SET_NULL,
        related_name="emails_sent",
    )
    # auto_now_add — immutable timestamp, this record is never edited
    sent_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"To: {self.to_email} | {self.subject[:50]} | {self.status}"

    class Meta:
        ordering = ["-sent_at"]   # most recent first