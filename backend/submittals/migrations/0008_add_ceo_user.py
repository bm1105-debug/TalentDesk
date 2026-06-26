"""
Data migration: ensure a CEO user exists with known credentials.
Creates 'ceo_admin' if no CEO-role user is present, or resets its password.
"""
from django.db import migrations
from django.contrib.auth.hashers import make_password

CEO_PASSWORD = make_password("TalentDesk@2024")


def add_ceo(apps, schema_editor):
    User = apps.get_model("users", "User")

    # If an existing user has CEO role, just ensure password is set correctly
    ceo_users = User.objects.filter(role="ceo")
    if ceo_users.exists():
        ceo_users.update(password=CEO_PASSWORD)
        return

    # No CEO exists — create one
    User.objects.get_or_create(
        username="ceo_admin",
        defaults=dict(
            first_name="CEO",
            last_name="Admin",
            email="ceo@talentdesk.demo",
            role="ceo",
            password=CEO_PASSWORD,
            is_active=True,
            is_staff=True,
        ),
    )
    User.objects.filter(username="ceo_admin").update(password=CEO_PASSWORD)


class Migration(migrations.Migration):

    dependencies = [
        ("submittals", "0007_add_status_updated_index"),
    ]

    operations = [
        migrations.RunPython(add_ceo, migrations.RunPython.noop),
    ]
