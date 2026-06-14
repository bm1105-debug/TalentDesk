"""
management command: python manage.py seed
Creates realistic test data across all apps:
  - 4 staff users  (1 CEO, 1 manager, 2 recruiters)
  - 10 clients
  - 100 candidates with skills
  - 20 jobs
  - 40 submittals
  - 20 interviews
  - 3 email templates
Safe to re-run — skips records that already exist where possible.
"""

import random
from datetime import date, timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone

from users.models import User, Role
from clients.models import Client, Contact
from candidates.models import Candidate, SkillTag
from jobs.models import Job, PipelineStage
from submittals.models import Submittal, SubmittalEvent
from interviews.models import Interview
from communications.models import EmailTemplate


# ── Raw data pools ─────────────────────────────────────────────────────────────

FIRST_NAMES = [
    "James", "Sarah", "Michael", "Emily", "David", "Jessica", "Daniel", "Laura",
    "Matthew", "Olivia", "Andrew", "Sophie", "Christopher", "Charlotte", "Ryan",
    "Emma", "Joshua", "Hannah", "Benjamin", "Megan", "Samuel", "Rachel", "Nathan",
    "Victoria", "Alexander", "Rebecca", "Thomas", "Lauren", "Joseph", "Amy",
    "Arjun", "Priya", "Mohammed", "Fatima", "Chen", "Wei", "Carlos", "Maria",
    "Lucas", "Isabelle", "Ravi", "Ananya", "Kofi", "Amara", "Ivan", "Natasha",
    "Ali", "Zara", "Liam", "Chloe",
]

LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Wilson", "Taylor", "Anderson", "Thomas", "Jackson", "White", "Harris",
    "Martin", "Thompson", "Robinson", "Clark", "Lewis", "Lee", "Walker", "Hall",
    "Allen", "Young", "King", "Wright", "Scott", "Torres", "Nguyen",
    "Patel", "Kumar", "Singh", "Shah", "Khan", "Ahmed", "Ali", "Chen",
    "Zhang", "Wang", "Lopez", "Martinez", "Gonzalez", "Perez", "Santos",
    "Murphy", "O'Brien", "Walsh", "Ryan", "Byrne",
]

JOB_TITLES = [
    "Senior Software Engineer", "Product Manager", "Data Scientist",
    "DevOps Engineer", "Frontend Developer", "Backend Developer",
    "Full Stack Engineer", "Machine Learning Engineer", "Cloud Architect",
    "Security Engineer", "QA Engineer", "Technical Lead",
    "Engineering Manager", "Scrum Master", "Business Analyst",
    "UX Designer", "UI Designer", "Mobile Developer",
    "Site Reliability Engineer", "Database Administrator",
    "Solutions Architect", "Java Developer", "Python Developer",
    "React Developer", "Node.js Developer",
]

COMPANIES = [
    "Google", "Microsoft", "Amazon", "Meta", "Apple", "Netflix", "Spotify",
    "Salesforce", "Oracle", "SAP", "IBM", "Accenture", "Deloitte", "KPMG",
    "Barclays", "HSBC", "Goldman Sachs", "JPMorgan", "Deutsche Bank",
    "Revolut", "Monzo", "Wise", "Klarna", "Stripe", "Twilio",
    "Deliveroo", "Just Eat", "Ocado", "Arm", "Sage",
]

SKILLS_POOL = [
    "python", "django", "javascript", "react", "typescript", "node.js",
    "java", "spring boot", "sql", "postgresql", "mongodb", "redis",
    "aws", "azure", "gcp", "docker", "kubernetes", "terraform",
    "ci/cd", "git", "agile", "scrum", "machine learning", "data analysis",
    "pandas", "numpy", "tableau", "power bi", "figma", "sketch",
    "ios", "android", "flutter", "graphql", "rest api", "microservices",
    "c#", ".net", "go", "rust", "scala", "kafka", "elasticsearch",
]

LOCATIONS = [
    "London, UK", "Manchester, UK", "Birmingham, UK", "Leeds, UK",
    "Bristol, UK", "Edinburgh, UK", "Dublin, Ireland", "Remote",
    "New York, USA", "San Francisco, USA", "Berlin, Germany",
    "Amsterdam, Netherlands", "Paris, France", "Toronto, Canada",
]

CLIENT_NAMES = [
    "Apex Digital Solutions", "Bridgewater Consulting", "Crestline Technologies",
    "Delta Systems Group", "Echo Analytics", "Fusion FinTech",
    "Greenway Software", "Horizon Cloud Services", "Ignite Labs",
    "Junction Media",
]

INDUSTRIES = [
    "Technology", "Finance", "Healthcare", "E-Commerce", "Consulting",
    "Media", "Energy", "Logistics", "Education", "Retail",
]

JOB_OPENINGS = [
    "Senior Python Developer", "React Frontend Engineer", "DevOps Lead",
    "Data Engineer", "Product Manager", "Java Backend Developer",
    "Cloud Solutions Architect", "QA Automation Engineer",
    "Technical Project Manager", "Machine Learning Engineer",
    "Full Stack Developer", "Security Analyst", "Scrum Master",
    "Node.js Developer", "Mobile Engineer (iOS)",
    "Business Intelligence Developer", "Database Administrator",
    "Site Reliability Engineer", "Solutions Architect",
    "Engineering Manager",
]

NOTES_POOL = [
    "Strong communicator, excellent references from previous role.",
    "Available immediately. Open to relocation.",
    "Currently on a 3-month notice period. Salary expectations £90k+.",
    "Impressive portfolio of open-source contributions.",
    "Previously worked at a unicorn startup — strong culture fit.",
    "Referred by existing client contact.",
    "Speaks fluent English and Spanish.",
    "Looking for fully remote position only.",
    "5+ years in fintech, strong regulatory knowledge.",
    "Recently completed AWS Solutions Architect certification.",
    "",  # some candidates have no notes
    "",
    "",
]


class Command(BaseCommand):
    help = "Seed the database with 100 test records"

    def handle(self, *args, **options):
        self.stdout.write("Seeding database...")

        ceo, recruiters, manager = self._create_users()
        clients                  = self._create_clients()
        skills                   = self._create_skills()
        candidates               = self._create_candidates(skills, ceo)
        jobs                     = self._create_jobs(clients, manager, recruiters)
        submittals               = self._create_submittals(candidates, jobs, recruiters)
        self._create_interviews(submittals, recruiters)
        self._create_email_templates(manager)

        self.stdout.write(self.style.SUCCESS(
            f"\nDone! Created:\n"
            f"  {len(recruiters)+2} users\n"
            f"  {len(clients)} clients\n"
            f"  {len(candidates)} candidates\n"
            f"  {len(jobs)} jobs\n"
            f"  {len(submittals)} submittals\n"
            f"  interviews + email templates\n"
        ))

    # ── Users ──────────────────────────────────────────────────────────────────

    def _create_users(self):
        ceo, _ = User.objects.get_or_create(
            username="ceo",
            defaults=dict(
                email="ceo@talentdesk.io", first_name="Diana", last_name="Prince",
                role=Role.CEO, is_staff=True,
            ),
        )
        if _: ceo.set_password("pass1234"); ceo.save()

        manager, _ = User.objects.get_or_create(
            username="manager1",
            defaults=dict(
                email="manager1@talentdesk.io", first_name="Marcus", last_name="Cole",
                role=Role.ACCOUNT_MANAGER,
            ),
        )
        if _: manager.set_password("pass1234"); manager.save()

        recruiter_data = [
            ("recruiter1", "Alex",  "Reid",    "recruiter1@talentdesk.io"),
            ("recruiter2", "Priya", "Sharma",  "recruiter2@talentdesk.io"),
        ]
        recruiters = []
        for username, fn, ln, email in recruiter_data:
            r, created = User.objects.get_or_create(
                username=username,
                defaults=dict(email=email, first_name=fn, last_name=ln, role=Role.RECRUITER),
            )
            if created: r.set_password("pass1234"); r.save()
            recruiters.append(r)

        self.stdout.write(f"  +users")
        return ceo, recruiters, manager

    # ── Clients ────────────────────────────────────────────────────────────────

    def _create_clients(self):
        clients = []
        for i, name in enumerate(CLIENT_NAMES):
            c, _ = Client.objects.get_or_create(
                name=name,
                defaults=dict(
                    industry=INDUSTRIES[i % len(INDUSTRIES)],
                    status=random.choice(["active", "active", "active", "inactive"]),
                    website=f"https://www.{name.lower().replace(' ', '')}.com",
                    notes=f"Key account — {INDUSTRIES[i % len(INDUSTRIES)]} sector.",
                ),
            )
            clients.append(c)
            # Add a contact for each client
            Contact.objects.get_or_create(
                client=c,
                email=f"contact@{name.lower().replace(' ', '')}.com",
                defaults=dict(
                    first_name=random.choice(FIRST_NAMES),
                    last_name=random.choice(LAST_NAMES),
                    phone=f"+44 7{random.randint(100,999)} {random.randint(100000,999999)}",
                    title="HR Director",
                    is_primary=True,
                ),
            )
        self.stdout.write(f"  +clients")
        return clients

    # ── Skills ─────────────────────────────────────────────────────────────────

    def _create_skills(self):
        skills = []
        for name in SKILLS_POOL:
            tag, _ = SkillTag.objects.get_or_create(name=name)
            skills.append(tag)
        self.stdout.write(f"  +skills ({len(skills)} tags)")
        return skills

    # ── Candidates ─────────────────────────────────────────────────────────────

    def _create_candidates(self, skills, created_by):
        candidates = []
        used_emails = set(Candidate.objects.values_list("email", flat=True))
        used_phones = set(Candidate.objects.values_list("phone", flat=True))

        target = 100
        attempts = 0
        while len(candidates) < target and attempts < target * 3:
            attempts += 1
            fn    = random.choice(FIRST_NAMES)
            ln    = random.choice(LAST_NAMES)
            email = f"{fn.lower()}.{ln.lower()}{random.randint(1,999)}@example.com"
            phone = f"+44 7{random.randint(100,999)} {random.randint(100000,999999)}"

            if email in used_emails or phone in used_phones:
                continue

            used_emails.add(email)
            used_phones.add(phone)

            c = Candidate.objects.create(
                first_name      = fn,
                last_name       = ln,
                email           = email,
                phone           = phone,
                current_title   = random.choice(JOB_TITLES),
                current_company = random.choice(COMPANIES),
                location        = random.choice(LOCATIONS),
                status          = random.choices(
                    ["active", "passive", "placed", "blacklisted"],
                    weights=[60, 25, 10, 5], k=1
                )[0],
                source          = random.choice(["referral", "job_board", "linkedin", "direct", "other"]),
                notes           = random.choice(NOTES_POOL),
                created_by      = created_by,
            )
            # Assign 2–6 random skills
            c.skills.set(random.sample(skills, k=random.randint(2, 6)))
            candidates.append(c)

        self.stdout.write(f"  +candidates ({len(candidates)})")
        return candidates

    # ── Jobs ───────────────────────────────────────────────────────────────────

    def _create_jobs(self, clients, created_by, recruiters):
        jobs = []
        today = date.today()

        for i, title in enumerate(JOB_OPENINGS):
            client = clients[i % len(clients)]
            status = random.choices(
                ["open", "open", "draft", "on_hold", "filled", "cancelled"],
                weights=[40, 20, 15, 10, 10, 5], k=1
            )[0]
            priority = random.choices(
                ["low", "medium", "high", "urgent"],
                weights=[10, 50, 30, 10], k=1
            )[0]

            j = Job.objects.create(
                title       = title,
                client      = client,
                status      = status,
                priority    = priority,
                job_type    = random.choice(["full_time", "contract", "part_time"]),
                openings    = random.randint(1, 4),
                location    = random.choice(LOCATIONS),
                salary_min  = random.choice([50000, 60000, 70000, 80000, 90000]),
                salary_max  = random.choice([90000, 100000, 110000, 120000, 140000]),
                target_date = today + timedelta(days=random.randint(14, 120)),
                description = f"We are looking for a talented {title} to join {client.name}.",
                requirements= "Strong communication skills. Relevant experience required.",
                created_by  = created_by,
            )
            # Assign 1–2 recruiters
            for r in random.sample(recruiters, k=random.randint(1, min(2, len(recruiters)))):
                j.assigned_to.add(r)

            # Create default pipeline stages
            stage_names = ["Screening", "Interview", "Technical Assessment", "Offer", "Placed"]
            PipelineStage.objects.bulk_create([
                PipelineStage(job=j, name=name, order=idx)
                for idx, name in enumerate(stage_names)
            ])
            jobs.append(j)

        self.stdout.write(f"  +jobs ({len(jobs)})")
        return jobs

    # ── Submittals ─────────────────────────────────────────────────────────────

    def _create_submittals(self, candidates, jobs, recruiters):
        submittals = []
        open_jobs  = [j for j in jobs if j.status in ("open", "draft")]
        used_pairs = set(
            Submittal.objects.values_list("candidate_id", "job_id")
        )

        active_candidates = [c for c in candidates if c.status == "active"]
        random.shuffle(active_candidates)

        for i, candidate in enumerate(active_candidates[:40]):
            job = open_jobs[i % len(open_jobs)]
            if (candidate.id, job.id) in used_pairs:
                continue
            used_pairs.add((candidate.id, job.id))

            status = random.choices(
                ["active", "active", "active", "placed", "rejected", "withdrawn"],
                weights=[50, 10, 10, 10, 15, 5], k=1
            )[0]
            recruiter = random.choice(recruiters)

            s = Submittal.objects.create(
                candidate    = candidate,
                job          = job,
                submitted_by = recruiter,
                cover_note   = f"{candidate.first_name} is a great fit for the {job.title} role.",
                status       = status,
            )

            # Advance through 1–3 pipeline stages
            stages = list(job.stages.order_by("order"))
            if stages:
                for stage in stages[:random.randint(1, min(3, len(stages)))]:
                    SubmittalEvent.objects.create(
                        submittal  = s,
                        event_type = "stage_change",
                        to_stage   = stage,
                        notes      = "Progressed to next stage.",
                        created_by = recruiter,
                    )
                    s.current_stage = stage
                s.save(update_fields=["current_stage", "updated_at"])

            submittals.append(s)

        self.stdout.write(f"  +submittals ({len(submittals)})")
        return submittals

    # ── Interviews ─────────────────────────────────────────────────────────────

    def _create_interviews(self, submittals, recruiters):
        active = [s for s in submittals if s.status == "active"]
        count  = 0
        now    = timezone.now()

        for s in random.sample(active, k=min(20, len(active))):
            days_offset = random.randint(-5, 30)   # some past, mostly future
            scheduled   = now + timedelta(days=days_offset, hours=random.randint(9, 17))

            i_status = "scheduled"
            if days_offset < 0:
                i_status = random.choice(["completed", "no_show", "cancelled"])

            Interview.objects.create(
                submittal        = s,
                interview_type   = random.choice(["phone", "video", "in_person", "technical"]),
                scheduled_at     = scheduled,
                duration_minutes = random.choice([30, 45, 60, 90]),
                status           = i_status,
                meeting_link     = "https://meet.google.com/abc-defg-hij" if random.random() > 0.4 else "",
                notes            = "Interview arranged via email." if i_status == "scheduled" else "Interview completed.",
                created_by       = random.choice(recruiters),
            )
            count += 1

        self.stdout.write(f"  +interviews ({count})")

    # ── Email Templates ────────────────────────────────────────────────────────

    def _create_email_templates(self, created_by):
        templates = [
            {
                "name":               "Initial Outreach",
                "template_type":      "intro",
                "subject":            "Exciting opportunity: {{ job_title }} at {{ company_name }}",
                "body":               "Hi {{ candidate_name }},\n\nI hope this message finds you well. I came across your profile and thought you'd be a great fit for a {{ job_title }} role with one of our clients, {{ company_name }}.\n\nWould you be open to a quick call to discuss?\n\nBest regards,\n{{ recruiter_name }}",
                "available_variables":"candidate_name, job_title, company_name, recruiter_name",
            },
            {
                "name":               "Interview Invitation",
                "template_type":      "interview",
                "subject":            "Interview Invitation — {{ job_title }}",
                "body":               "Dear {{ candidate_name }},\n\nThank you for your interest in the {{ job_title }} position. We would like to invite you to an interview on {{ interview_date }} at {{ interview_time }}.\n\nPlease confirm your availability by replying to this email.\n\nKind regards,\n{{ recruiter_name }}",
                "available_variables":"candidate_name, job_title, interview_date, interview_time, recruiter_name",
            },
            {
                "name":               "Offer Letter Follow-up",
                "template_type":      "offer",
                "subject":            "Offer — {{ job_title }} at {{ company_name }}",
                "body":               "Dear {{ candidate_name }},\n\nWe are delighted to confirm the offer for the {{ job_title }} position at {{ company_name }}. The proposed salary is {{ salary }}.\n\nPlease let us know if you have any questions.\n\nWarm regards,\n{{ recruiter_name }}",
                "available_variables":"candidate_name, job_title, company_name, salary, recruiter_name",
            },
        ]

        count = 0
        for t in templates:
            _, created = EmailTemplate.objects.get_or_create(
                name=t["name"],
                defaults={**t, "created_by": created_by},
            )
            if created: count += 1

        self.stdout.write(f"  +email templates ({count} new)")
