from django.contrib import admin
from .models import Candidate, SkillTag

@admin.register(SkillTag)
class SkillTagAdmin(admin.ModelAdmin):
    search_fields = ["name"]

@admin.register(Candidate)
class CandidateAdmin(admin.ModelAdmin):
    list_display  = ["first_name", "last_name", "email", "phone", "status", "source", "created_at"]
    list_filter   = ["status", "source"]
    search_fields = ["first_name", "last_name", "email", "phone"]
    filter_horizontal = ["skills"]  # makes the ManyToMany widget usable in admin