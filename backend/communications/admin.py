from django.contrib import admin
from .models import GeneratedEmail


@admin.register(GeneratedEmail)
class GeneratedEmailAdmin(admin.ModelAdmin):
    list_display  = ["user", "mode", "purpose", "tone", "length", "created_at"]
    list_filter   = ["mode", "tone"]
    search_fields = ["purpose", "recipient"]
    readonly_fields = [f.name for f in GeneratedEmail._meta.fields]

    def has_add_permission(self, request):
        return False
