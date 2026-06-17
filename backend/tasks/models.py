from django.db import models
from django.conf import settings


class Task(models.Model):

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        DONE = "done", "Done"

    title      = models.CharField(max_length=300)
    due_date   = models.DateField(null=True, blank=True, db_index=True)
    status     = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN, db_index=True)

    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="tasks",
        db_index=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="tasks_created",
    )

    related_candidate = models.ForeignKey(
        "candidates.Candidate",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="tasks",
    )
    related_job = models.ForeignKey(
        "jobs.Job",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="tasks",
    )

    # Set to today when a due-today notification is sent; cleared when task re-opened
    notified_at = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["due_date", "created_at"]

    def __str__(self):
        return f"{self.title} → {self.assignee}"
