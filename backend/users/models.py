'''  
Replaces Django's default User with our custom one. 
Adds a role field with 4 choices (Recruiter, Account Manager, Team Lead, CEO). 
The AUTH_USER_MODEL = "users.User" in settings points here. 
Must be defined before the first migration
'''

from django.contrib.auth.models import AbstractUser
from django.db import models


class Role(models.TextChoices):
    RECRUITER = "recruiter", "Recruiter"
    ACCOUNT_MANAGER = "account_manager", "Account Manager"
    TEAM_LEAD = "team_lead", "Team Lead"
    CEO = "ceo", "CEO / Admin"

class User(AbstractUser):
    # Role determines what the user can see and do across the entire app
    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.RECRUITER,
        db_index=True,
    )
    phone = models.CharField(max_length=20, blank=True)

    class Meta:
        indexes = [models.Index(fields=["role", "is_active"])]

    # Convenience properties used in permission checks
    @property
    def is_recruiter(self):
        return self.role == Role.RECRUITER

    @property
    def is_account_manager(self):
        return self.role == Role.ACCOUNT_MANAGER

    @property
    def is_team_lead(self):
        return self.role == Role.TEAM_LEAD

    @property
    def is_ceo(self):
        return self.role == Role.CEO

    def can_manage_all(self):
        """True for roles that can see all recruiters' data."""
        return self.role in (Role.CEO, Role.ACCOUNT_MANAGER)
