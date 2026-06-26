'''
Replaces Django's default User with our custom one.
Adds a role field with 4 choices (Recruiter, Team Lead, VP, CEO).
The AUTH_USER_MODEL = "users.User" in settings points here.
Must be defined before the first migration
'''

from django.contrib.auth.models import AbstractUser
from django.db import models


class Role(models.TextChoices):
    RECRUITER = "recruiter", "Recruiter"
    TEAM_LEAD = "team_lead", "Team Lead"
    VP = "vp", "VP"
    CEO = "ceo", "CEO / Admin"

class User(AbstractUser):
    email = models.EmailField(unique=True, verbose_name="email address")

    # Role determines what the user can see and do across the entire app
    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.RECRUITER,
        db_index=True,
    )
    phone = models.CharField(max_length=20, blank=True)

    # Pod relationship: a Recruiter reports to a Team Lead.
    # SET_NULL so deleting a Team Lead account doesn't cascade to their pod.
    reports_to = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='direct_reports',
        limit_choices_to={'role': Role.TEAM_LEAD},
    )

    class Meta:
        indexes = [models.Index(fields=["role", "is_active"])]

    # Convenience properties used in permission checks
    @property
    def is_recruiter(self):
        return self.role == Role.RECRUITER

    @property
    def is_vp(self):
        return self.role == Role.VP

    @property
    def is_team_lead(self):
        return self.role == Role.TEAM_LEAD

    @property
    def is_ceo(self):
        return self.role == Role.CEO

    def can_manage_all(self):
        """True for roles that can see all recruiters' data."""
        return self.role in (Role.CEO, Role.VP)

    def __str__(self):
        return self.get_full_name() or self.get_username()

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.reports_to_id and self.reports_to_id == self.pk:
            raise ValidationError({'reports_to': 'A user cannot report to themselves.'})
        # Prevent A → B → A circular chains (one level is enough for our model)
        if self.reports_to_id and self.reports_to.reports_to_id == self.pk:
            raise ValidationError({'reports_to': 'Circular reporting chain detected.'})
