# offers/models.py

from django.db import models
from django.conf import settings
from submittals.models import Submittal, SubmittalEvent


class Offer(models.Model):
    """
    A formal offer made to a candidate on a specific submittal.
    One submittal can have multiple offers (e.g. initial offer declined,
    revised offer made). Only one offer should be 'pending' at a time —
    enforced at the view level, not the DB level, to allow history.
    """

    class Status(models.TextChoices):
        PENDING   = "pending",   "Pending"
        ACCEPTED  = "accepted",  "Accepted"
        DECLINED  = "declined",  "Declined"
        WITHDRAWN = "withdrawn", "Withdrawn"

    submittal = models.ForeignKey(
        Submittal,
        on_delete=models.CASCADE,
        related_name="offers",
        db_index=True,
    )

    salary   = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default="USD")

    offer_date  = models.DateField()
    expiry_date = models.DateField(null=True, blank=True)
    start_date  = models.DateField(null=True, blank=True)

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )

    notes = models.TextField(blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="offers_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "offer_date"]),
        ]

    def __str__(self):
        return f"Offer for {self.submittal} — {self.status}"

    def accept(self, actor):
        """Mark accepted and auto-place the linked submittal to its terminal stage."""
        from jobs.models import PipelineStage

        self.status = self.Status.ACCEPTED
        self.save(update_fields=["status", "updated_at"])

        submittal = self.submittal

        placed_stage = (
            PipelineStage.objects
            .filter(job=submittal.job)
            .order_by("-order")
            .first()
        )

        SubmittalEvent.objects.create(
            submittal  = submittal,
            event_type = SubmittalEvent.EventType.STATUS_CHANGE,
            notes      = f"Offer accepted — submittal placed. Offer ID: {self.pk}",
            created_by = actor,
        )

        submittal.status        = Submittal.SubmittalStatus.PLACED
        submittal.current_stage = placed_stage
        submittal.save(update_fields=["status", "current_stage", "updated_at"])

    def decline(self, actor, notes=""):
        """Mark declined. Submittal stage left for recruiter to decide."""
        self.status = self.Status.DECLINED
        if notes:
            self.notes = notes
        self.save(update_fields=["status", "notes", "updated_at"])

    def withdraw(self, actor, notes=""):
        """Mark withdrawn by the firm. Submittal stage unchanged."""
        self.status = self.Status.WITHDRAWN
        if notes:
            self.notes = notes
        self.save(update_fields=["status", "notes", "updated_at"])
