from django.db import models
from django.conf import settings


class ActivityLog(models.Model):
    """
    Immutable audit record of every successful write action across all apps.
    Written by middleware — no view or serializer should create these directly.
    """

    class Action(models.TextChoices):
        CREATE = "create", "Create"   # POST → 201
        UPDATE = "update", "Update"   # PUT / PATCH → 200
        DELETE = "delete", "Delete"   # DELETE → 204

    # Who performed the action — null if the user account was later deleted
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="activity_logs",
    )

    action      = models.CharField(max_length=10, choices=Action.choices)
    method      = models.CharField(max_length=10)        # raw HTTP method: POST, PATCH, DELETE
    endpoint    = models.CharField(max_length=255)       # request path e.g. /api/candidates/5/
    model_name  = models.CharField(max_length=100, blank=True)  # derived from URL: "candidates"
    object_id   = models.CharField(max_length=50, blank=True)   # PK from URL, blank for list actions
    status_code = models.IntegerField()                  # actual HTTP response code

    # IP of the requester — useful for security audits
    ip_address  = models.GenericIPAddressField(null=True, blank=True)

    # auto_now_add makes the timestamp immutable — log entries are never edited
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]   # most recent first
        indexes = [
            models.Index(fields=["model_name", "action"]),
            models.Index(fields=["user", "created_at"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        user = str(self.user) if self.user else "anonymous"
        return f"{user} | {self.action} {self.model_name} {self.object_id} @ {self.created_at:%Y-%m-%d %H:%M}"