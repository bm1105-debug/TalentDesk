'''
 Registers the Interview model in Django admin with filters 
 and search so managers can view and manage all scheduled interviews from the admin panel. 
 The inline display under each submittal gives a full timeline view.

 '''

from django.contrib import admin
from .models import Interview

@admin.register(Interview)
class InterviewAdmin(admin.ModelAdmin):
    list_display  = [
        "submittal", "interview_type", "status",
        "scheduled_at", "duration_minutes", "interviewer", "created_at",
    ]
    list_filter   = ["status", "interview_type"]
    search_fields = [
        "submittal__candidate__first_name",
        "submittal__candidate__last_name",
        "submittal__job__title",       # search by job title
        "interviewer__username",
    ]
    readonly_fields = ["created_at", "updated_at", "created_by"]
    ordering = ["scheduled_at"]