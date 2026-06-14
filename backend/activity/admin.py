from django.contrib import admin
from .models import ActivityLog


@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
    list_display  = ["user", "action", "model_name", "object_id", "endpoint", "status_code", "ip_address", "created_at"]
    list_filter   = ["action", "model_name", "status_code"]
    search_fields = ["user__username", "endpoint", "model_name", "object_id"]
    readonly_fields = [f.name for f in ActivityLog._meta.fields]  # every field is read-only

    def has_add_permission(self, request):
        # Logs are written only by middleware — never manually
        return False

    def has_delete_permission(self, request, obj=None):
        # Audit logs must never be deleted, even by admins
        return False