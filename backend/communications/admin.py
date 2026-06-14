'''
Registers both models in admin. 
SentEmail is fully read-only — sent emails must never be edited or deleted. 
EmailTemplate is fully editable so managers can create and update templates.

'''

from django.contrib import admin
from .models import EmailTemplate, SentEmail


@admin.register(EmailTemplate)
class EmailTemplateAdmin(admin.ModelAdmin):
    list_display  = ["name", "template_type", "subject", "created_by", "updated_at"]
    list_filter   = ["template_type"]
    search_fields = ["name", "subject"]
    readonly_fields = ["created_by", "created_at", "updated_at"]

@admin.register(SentEmail)
class SentEmailAdmin(admin.ModelAdmin):
    list_display  = ["to_email", "to_name", "subject", "status", "sent_by", "sent_at"]
    list_filter   = ["status", "template"]
    search_fields = ["to_email", "to_name", "subject"]
    # Every field is read-only — the sent log is immutable
    readonly_fields = [f.name for f in SentEmail._meta.fields]

    def has_add_permission(self, request):
        # Emails are logged automatically on send — never created manually
        return False

    def has_delete_permission(self, request, obj=None):
        # Audit log must never be deleted
        return False