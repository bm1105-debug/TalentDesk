'''
 Defines the Interview model — the scheduling record that links a Submittal (candidate + job pairing) to a specific interview event.
 One submittal can have multiple interviews (phone screen → technical → panel), each with its own type, time, interviewer, and outcome.

 '''

from django.db import models
from django.conf import settings
from submittals.models import Submittal

class Interview(models.Model):

    class InterviewType(models.TextChoices):
        PHONE      = "phone",      "Phone Screen"
        VIDEO      = "video",      "Video Call"
        ONSITE     = "onsite",     "On-site"
        TECHNICAL  = "technical",  "Technical Assessment"
        PANEL      = "panel",      "Panel Interview"

    class Status(models.TextChoices):
        SCHEDULED  = "scheduled",  "Scheduled"   # confirmed, upcoming
        COMPLETED  = "completed",  "Completed"   # happened, notes may be added
        CANCELLED  = "cancelled",  "Cancelled"   # called off by either side
        NO_SHOW    = "no_show",    "No Show"     # candidate didn't attend

    # Which candidate+job pairing this interview belongs to
    # CASCADE: deleting a submittal removes all its interviews
    submittal = models.ForeignKey(
        Submittal,
        on_delete=models.CASCADE,
        related_name="interviews",
    )

    interview_type   = models.CharField(max_length=20, choices=InterviewType.choices)
    scheduled_at     = models.DateTimeField()        # when the interview is set to happen
    duration_minutes = models.PositiveIntegerField(default=60)  # expected length

    # For video calls — a meet link, Zoom URL etc.
    meeting_link = models.URLField(blank=True)

    # For on-site — physical address or room number
    location = models.CharField(max_length=255, blank=True)

    # The person conducting the interview — nullable in case the interviewer
    # is on the client side and doesn't have a system account
    interviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="interviews_conducting",
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.SCHEDULED,
    )

    # Score entered by the interviewer after the interview (0–100)
    score = models.PositiveSmallIntegerField(null=True, blank=True)

    # Outcome notes added by the recruiter or interviewer after the interview
    notes = models.TextField(blank=True)

    # SET_NULL so deleting a recruiter account doesn't remove the interview record
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="interviews_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["scheduled_at"]   # chronological — next interview first
        indexes = [
            models.Index(fields=["status", "scheduled_at"]),
        ]

    def __str__(self):
        return f"{self.interview_type} | {self.submittal} | {self.scheduled_at:%Y-%m-%d %H:%M}"