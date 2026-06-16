from django.contrib import admin
from .models import Attachment

@admin.register(Attachment)
class AttachmentAdmin(admin.ModelAdmin):
    list_display = ["original_name", "candidate", "file_size", "uploaded_by", "created_at"]
    list_select_related = ["candidate", "uploaded_by"]
