from django.db import models
from django.conf import settings

class SkillTag(models.Model):
    # Normalized skill label — stored lowercase to prevent "Python" vs "python" duplicates
    name = models.CharField(max_length=100, unique=True)

    def save(self, *args, **kwargs):
        # Force lowercase on every save so lookups are always consistent
        self.name = self.name.strip().lower()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ["name"]


class Candidate(models.Model):

    class Status(models.TextChoices):
        ACTIVE   = "active",      "Active"       # open to opportunities
        PASSIVE  = "passive",     "Passive"      # employed, not actively looking
        PLACED   = "placed",      "Placed"       # already placed by us
        BLACKLISTED = "blacklisted", "Blacklisted"  # do not contact

    class Source(models.TextChoices):
        REFERRAL   = "referral",    "Referral"
        JOB_BOARD  = "job_board",   "Job Board"
        LINKEDIN   = "linkedin",    "LinkedIn"
        DIRECT     = "direct",      "Direct Application"
        OTHER      = "other",       "Other"

    # Core identity — both email and phone are dedup keys
    first_name = models.CharField(max_length=100)
    last_name  = models.CharField(max_length=100)
    email      = models.EmailField(unique=True)
    phone      = models.CharField(max_length=20, unique=True)

    # Professional snapshot
    current_title   = models.CharField(max_length=150, blank=True)
    current_company = models.CharField(max_length=150, blank=True)
    location        = models.CharField(max_length=150, blank=True)
    linkedin_url    = models.URLField(blank=True)

    # Recruiter-facing metadata
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    source = models.CharField(max_length=20, choices=Source.choices, default=Source.OTHER)
    notes  = models.TextField(blank=True)

    # Skills — many candidates share skills, many skills belong to many candidates
    skills = models.ManyToManyField(SkillTag, blank=True, related_name="candidates")

    # Audit fields
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="candidates_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.first_name} {self.last_name} <{self.email}>"

    class Meta:
        ordering = ["-created_at"]