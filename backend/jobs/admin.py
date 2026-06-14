from django.contrib import admin
from .models import Job, PipelineStage


class PipelineStageInline(admin.TabularInline):
    # Show stages directly inside the Job edit page — no need to navigate away
    model = PipelineStage
    extra = 0          # don't show blank extra rows by default
    ordering = ["order"]

@admin.register(Job)
class JobAdmin(admin.ModelAdmin):
    list_display  = ["title", "client", "status", "priority", "job_type", "openings", "target_date", "created_at"]
    list_filter   = ["status", "priority", "job_type"]
    search_fields = ["title", "client__name"]   # client__name lets you search by client name
    filter_horizontal = ["assigned_to"]         # makes the M2M widget usable
    inlines = [PipelineStageInline]             # stages editable inline under each job

@admin.register(PipelineStage)
class PipelineStageAdmin(admin.ModelAdmin):
    list_display  = ["job", "order", "name"]
    list_filter   = ["job"]
    ordering      = ["job", "order"]