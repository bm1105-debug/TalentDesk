"""
Data migration: rebuild demo users and redistribute candidates/submittals.

The original seeding used the REST API which runs Django's password validators.
"pass1234" fails CommonPasswordValidator, so most demo users were never created.
This migration creates them directly via ORM (bypassing validators) with set_password.

After running, log in with:
  vp.sharma / TalentDesk@2024
  team_lead_1 … team_lead_5 / TalentDesk@2024
  recruiter_1_1 … recruiter_5_5 / TalentDesk@2024
"""
from django.db import migrations
from django.contrib.auth.hashers import make_password


DEMO_PASSWORD = make_password("TalentDesk@2024")

TEAM_LEADS = [
    ("team_lead_1", "Rohan",  "Mehta"),
    ("team_lead_2", "Kavya",  "Nair"),
    ("team_lead_3", "Arjun",  "Iyer"),
    ("team_lead_4", "Sneha",  "Joshi"),
    ("team_lead_5", "Vikram", "Sharma"),
]

RECRUITERS = [
    [
        ("recruiter_1_1", "Aditya",  "Verma"),
        ("recruiter_1_2", "Priya",   "Kapoor"),
        ("recruiter_1_3", "Rahul",   "Singh"),
        ("recruiter_1_4", "Anjali",  "Gupta"),
        ("recruiter_1_5", "Suresh",  "Kumar"),
    ],
    [
        ("recruiter_2_1", "Nisha",   "Patel"),
        ("recruiter_2_2", "Deepak",  "Rao"),
        ("recruiter_2_3", "Meera",   "Das"),
        ("recruiter_2_4", "Sanjay",  "Mishra"),
        ("recruiter_2_5", "Pooja",   "Shah"),
    ],
    [
        ("recruiter_3_1", "Karthik", "Reddy"),
        ("recruiter_3_2", "Divya",   "Pillai"),
        ("recruiter_3_3", "Manoj",   "Tiwari"),
        ("recruiter_3_4", "Swathi",  "Nayak"),
        ("recruiter_3_5", "Ramesh",  "Bose"),
    ],
    [
        ("recruiter_4_1", "Lakshmi", "Venkat"),
        ("recruiter_4_2", "Sunil",   "Pandey"),
        ("recruiter_4_3", "Geeta",   "Menon"),
        ("recruiter_4_4", "Vivek",   "Jain"),
        ("recruiter_4_5", "Rekha",   "Yadav"),
    ],
    [
        ("recruiter_5_1", "Harish",  "Shetty"),
        ("recruiter_5_2", "Shalini", "Choudhary"),
        ("recruiter_5_3", "Nitin",   "Desai"),
        ("recruiter_5_4", "Ritu",    "Saxena"),
        ("recruiter_5_5", "Ajay",    "Bhatt"),
    ],
]


def rebuild_demo(apps, schema_editor):
    User = apps.get_model("users", "User")
    Candidate = apps.get_model("candidates", "Candidate")
    Submittal = apps.get_model("submittals", "Submittal")

    # 1. Elevate admin to CEO so it can always see everything
    User.objects.filter(username="admin").update(role="ceo")

    # 2. Create VP
    vp, _ = User.objects.get_or_create(
        username="vp.sharma",
        defaults=dict(
            first_name="VP", last_name="Sharma",
            email="vp.sharma@talentdesk.demo",
            role="vp", password=DEMO_PASSWORD, is_active=True,
        ),
    )
    # Always reset password in case it was set wrongly before
    User.objects.filter(username="vp.sharma").update(password=DEMO_PASSWORD)

    # 3. Create team leads
    tl_objects = []
    for (uname, fn, ln) in TEAM_LEADS:
        tl, _ = User.objects.get_or_create(
            username=uname,
            defaults=dict(
                first_name=fn, last_name=ln,
                email=f"{uname}@talentdesk.demo",
                role="team_lead", password=DEMO_PASSWORD, is_active=True,
            ),
        )
        User.objects.filter(username=uname).update(
            password=DEMO_PASSWORD, role="team_lead"
        )
        tl_objects.append(User.objects.get(username=uname))

    # 4. Create recruiters and link to team leads
    all_recruiters = []
    for tl_idx, pod in enumerate(RECRUITERS):
        tl = tl_objects[tl_idx]
        for (uname, fn, ln) in pod:
            User.objects.get_or_create(
                username=uname,
                defaults=dict(
                    first_name=fn, last_name=ln,
                    email=f"{uname}@talentdesk.demo",
                    role="recruiter", password=DEMO_PASSWORD,
                    is_active=True, reports_to=tl,
                ),
            )
            User.objects.filter(username=uname).update(
                password=DEMO_PASSWORD, role="recruiter", reports_to=tl,
            )
            all_recruiters.append(User.objects.get(username=uname))

    # 5. Redistribute candidates (round-robin across 25 recruiters)
    candidates = list(Candidate.objects.order_by("id"))
    for i, c in enumerate(candidates):
        c.created_by = all_recruiters[i % len(all_recruiters)]
    Candidate.objects.bulk_update(candidates, ["created_by"])

    # 6. Redistribute submittals (same round-robin)
    submittals = list(Submittal.objects.order_by("id"))
    for i, s in enumerate(submittals):
        s.submitted_by = all_recruiters[i % len(all_recruiters)]
    Submittal.objects.bulk_update(submittals, ["submitted_by"])


class Migration(migrations.Migration):

    dependencies = [
        ("submittals", "0004_fix_demo_ownership"),
    ]

    operations = [
        migrations.RunPython(rebuild_demo, migrations.RunPython.noop),
    ]
