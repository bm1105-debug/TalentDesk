from django.contrib import admin
from .models import Submittal, SubmittalEvent

class SubmittalEventInline(admin.TabularInline):
    # Show the full event timeline inside the submittal edit page
    model   = SubmittalEvent
    extra   = 0
    ordering = ["created_at"]
    # Events are append-only — no editing or deleting from admin
    readonly_fields = ["event_type", "from_stage", "to_stage", "notes", "created_by", "created_at"]

    def has_add_permission(self, request, obj=None):
        # Prevent adding events manually through admin — they must go through the API
        return False

    def has_delete_permission(self, request, obj=None):
        # Events are immutable — never allow deletion even from admin
        return False
    

@admin.register(Submittal)
class SubmittalAdmin(admin.ModelAdmin):
    list_display  = ["candidate", "job", "current_stage", "status", "submitted_by", "created_at"]
    list_filter   = ["status"]
    search_fields = ["candidate__first_name", "candidate__last_name", "job__title"]
    readonly_fields = ["created_at", "updated_at"]
    inlines = [SubmittalEventInline]   # full event timeline visible per submittal


@admin.register(SubmittalEvent)
class SubmittalEventAdmin(admin.ModelAdmin):
    list_display  = ["submittal", "event_type", "from_stage", "to_stage", "created_by", "created_at"]
    list_filter   = ["event_type"]
    # All fields are read-only — events must never be edited after creation
    readonly_fields = ["submittal", "event_type", "from_stage", "to_stage", "notes", "created_by", "created_at"]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False