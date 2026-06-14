'''
Two models — Client (the company the firm recruits for) 
and Contact (a person at that company). 
A client can have many contacts. 
Both track who created them and when, which feeds the activity log later

'''

from django.db import models
from users.models import User

class ClientStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    INACTIVE = "inactive", "Inactive"
    PROSPECT = "prospect", "Prospect"

class Client(models.Model):
    # Core company info
    name = models.CharField(max_length=255, db_index=True)
    industry = models.CharField(max_length=100, blank=True)
    website = models.URLField(blank=True)
    location = models.CharField(max_length=255, blank=True)

    # Relationship health — used on the CEO dashboard
    status = models.CharField(
        max_length=20,
        choices=ClientStatus.choices,
        default=ClientStatus.ACTIVE,
        db_index=True,
    )

    # The account manager who owns this client relationship
    account_manager = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="managed_clients",
        db_index=True,
    )

    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_clients",
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        indexes = [
            models.Index(fields=["status", "account_manager"]),
        ]

    def __str__(self):
        return self.name


class Contact(models.Model):
    # A person at the client company — may be an interviewer or decision maker
    client = models.ForeignKey(
        Client,
        on_delete=models.CASCADE,
        related_name="contacts",
        db_index=True,
    )
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    title = models.CharField(max_length=150, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)

    # Marks the primary point of contact at this client
    is_primary = models.BooleanField(default=False, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-is_primary", "last_name"]

    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.client.name})"