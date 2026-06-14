# submittals/models.py

from django.db import models
from django.conf import settings
from candidates.models import Candidate
from jobs.models import Job, PipelineStage


class Submittal(models.Model):
    """
    A candidate being considered for a specific job.
    One candidate can be submitted to many jobs, but only once per job.
    """

    class SubmittalStatus(models.TextChoices):
        ACTIVE     = "active",     "Active"      # progressing through pipeline
        WITHDRAWN  = "withdrawn",  "Withdrawn"   # candidate pulled out
        REJECTED   = "rejected",   "Rejected"    # client said no
        PLACED     = "placed",     "Placed"      # offer accepted, job filled

    # The three-way link that makes this an ATS: candidate ↔ job via submittal
    candidate = models.ForeignKey(Candidate, on_delete=models.PROTECT, related_name="submittals")
    job       = models.ForeignKey(Job,       on_delete=models.PROTECT, related_name="submittals")

    # Which stage of the pipeline the candidate is currently at
    # Null on creation — stage is set when the first stage_change event fires
    current_stage = models.ForeignKey(
        PipelineStage,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="current_submittals",
    )

    status = models.CharField(
        max_length=20,
        choices=SubmittalStatus.choices,
        default=SubmittalStatus.ACTIVE,
    )

    # Free-text cover note the recruiter adds when first submitting the candidate
    cover_note = models.TextField(blank=True)

    # SET_NULL so deleting a recruiter account doesn't cascade-delete the submittal
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="submittals_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        # A candidate can only be submitted to a job once
        unique_together = [("candidate", "job")]

    def __str__(self):
        return f"{self.candidate} → {self.job.title}"


class SubmittalEvent(models.Model):
    """
    Append-only event log for every action taken on a submittal.
    Events are NEVER updated or deleted — they are the audit trail.
    The CEO dashboard and SLA reports are built entirely from these events.
    """

    class EventType(models.TextChoices):
        STAGE_CHANGE  = "stage_change",  "Stage Change"   # candidate moved to next stage
        NOTE          = "note",          "Note"           # recruiter left a comment
        STATUS_CHANGE = "status_change", "Status Change"  # withdrawn / rejected / placed

    submittal  = models.ForeignKey(Submittal, on_delete=models.CASCADE, related_name="events")
    event_type = models.CharField(max_length=20, choices=EventType.choices)

    # Stage the candidate moved FROM — null for the very first stage assignment
    from_stage = models.ForeignKey(
        PipelineStage,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="+",   # no reverse relation needed
    )
    # Stage the candidate moved TO — null for note and status_change events
    to_stage = models.ForeignKey(
        PipelineStage,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    # Human-readable context: reason for rejection, interview feedback, etc.
    notes = models.TextField(blank=True)

    # Who performed the action
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="submittal_events",
    )
    # auto_now_add makes this immutable — the timestamp can never be changed
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]   # chronological — oldest first for timeline display

    def __str__(self):
        return f"{self.submittal} | {self.event_type} @ {self.created_at:%Y-%m-%d %H:%M}"
