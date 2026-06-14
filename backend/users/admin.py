'''
Registers the custom User model in Django admin 
so superusers can manage accounts via the admin panel

'''

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from users.models import User

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    # Show role and phone in the user list view
    list_display = ("username", "email", "first_name", "last_name", "role", "is_active")
    list_filter = ("role", "is_active")

    # Add role and phone to the edit form under a new section
    fieldsets = BaseUserAdmin.fieldsets + (
        ("TalentDesk", {"fields": ("role", "phone")}),
    )

    # Add role and phone to the create user form as well
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ("TalentDesk", {"fields": ("role", "phone")}),
    )