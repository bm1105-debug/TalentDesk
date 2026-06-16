import os
from django.db import models
from django.conf import settings


def attachment_upload_path(instance, filename):
    return f"attachments/candidate_{instance.candidate_id}/{filename}"


class Attachment(models.Model):
    candidate = models.ForeignKey(
        "candidates.Candidate",
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    file = models.FileField(upload_to=attachment_upload_path)
    original_name = models.CharField(max_length=255)
    file_size = models.PositiveIntegerField()  # bytes
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="uploads",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.original_name} -> {self.candidate}"

    class Meta:
        ordering = ["-created_at"]
