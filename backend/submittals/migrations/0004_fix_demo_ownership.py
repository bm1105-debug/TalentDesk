"""
Data migration: reassign demo data from vp.sharma to actual recruiters.
Runs once automatically as part of migrate. No-ops if already fixed.
"""
from django.db import migrations


def fix_ownership(apps, schema_editor):
    User = apps.get_model("users", "User")
    Candidate = apps.get_model("candidates", "Candidate")
    Submittal = apps.get_model("submittals", "Submittal")

    vp_ids = list(User.objects.filter(role__in=["vp", "ceo"]).values_list("id", flat=True))
    if not vp_ids:
        return

    if not Candidate.objects.filter(created_by_id__in=vp_ids).exists():
        return  # already fixed

    recruiters = list(User.objects.filter(role="recruiter").order_by("id"))
    if not recruiters:
        return

    candidates = list(Candidate.objects.order_by("id"))
    for i, c in enumerate(candidates):
        c.created_by = recruiters[i % len(recruiters)]
    Candidate.objects.bulk_update(candidates, ["created_by"])

    submittals = list(Submittal.objects.order_by("id"))
    for i, s in enumerate(submittals):
        s.submitted_by = recruiters[i % len(recruiters)]
    Submittal.objects.bulk_update(submittals, ["submitted_by"])


class Migration(migrations.Migration):

    dependencies = [
        ("submittals", "0003_add_match_score_to_submittal"),
    ]

    operations = [
        migrations.RunPython(fix_ownership, migrations.RunPython.noop),
    ]
