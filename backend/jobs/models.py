from django.db import models
from django.conf import settings
from clients.models import Client

from django.db import models
from django.conf import settings
from clients.models import Client


class Job(models.Model):

    class JobType(models.TextChoices):
        FULL_TIME  = "full_time",  "Full Time"
        PART_TIME  = "part_time",  "Part Time"
        CONTRACT   = "contract",   "Contract"
        TEMP       = "temp",       "Temporary"

    class Status(models.TextChoices):
        DRAFT      = "draft",      "Draft"       # not yet visible to recruiters
        OPEN       = "open",       "Open"        # actively sourcing candidates
        ON_HOLD    = "on_hold",    "On Hold"     # client paused the search
        FILLED     = "filled",     "Filled"      # placement made successfully
        CANCELLED  = "cancelled",  "Cancelled"   # closed without placement

    class Priority(models.TextChoices):
        LOW    = "low",    "Low"
        MEDIUM = "medium", "Medium"
        HIGH   = "high",   "High"
        URGENT = "urgent", "Urgent"   # SLA alerts will fire on these first

    # What role the client wants filled
    title        = models.CharField(max_length=200)
    # PROTECT prevents deleting a client that still has jobs — data safety
    client       = models.ForeignKey(Client, on_delete=models.PROTECT, related_name="jobs")
    description  = models.TextField(blank=True)   # full JD for internal use
    requirements = models.TextField(blank=True)   # skills/experience the client specified
    location     = models.CharField(max_length=150, blank=True)

    job_type = models.CharField(max_length=20, choices=JobType.choices, default=JobType.FULL_TIME)
    status   = models.CharField(max_length=20, choices=Status.choices,  default=Status.DRAFT)
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.MEDIUM)

    # Nullable so jobs can be created before salary is agreed with the client
    salary_min = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    salary_max = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    # How many people the client wants to hire for this role
    openings = models.PositiveIntegerField(default=1)

    # Multiple recruiters can work the same job; one recruiter works many jobs
    assigned_to = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="assigned_jobs",
    )

    # Deadline the client expects the role to be filled by
    target_date = models.DateField(null=True, blank=True)

    # SET_NULL so deleting a recruiter account doesn't cascade-delete the job
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="jobs_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.title} @ {self.client.name}"

    class Meta:
        ordering = ["-created_at"]


# Applied automatically when a job is created — recruiters can edit stages afterwards
DEFAULT_PIPELINE = [
    "Screened",
    "Submitted",
    "Shortlisted",
    "L1 Interview",
    "L2 Interview",
    "Offer Released",
    "Offer Accepted",
    "Joined",
]


class PipelineStage(models.Model):
    # Each stage belongs to one job; deleting the job removes all its stages
    job   = models.ForeignKey(Job, on_delete=models.CASCADE, related_name="stages")
    name  = models.CharField(max_length=100)
    order = models.PositiveIntegerField()  # 0-indexed; controls display order in the UI

    class Meta:
        ordering = ["order"]
        unique_together = [
            ("job", "name"),   # no duplicate stage names on the same job
            ("job", "order"),  # no two stages can occupy the same position
        ]

    def __str__(self):
        return f"{self.job.title} — {self.order}. {self.name}"