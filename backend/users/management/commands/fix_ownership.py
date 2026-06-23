"""
One-shot management command: reassign candidates.created_by and
submittals.submitted_by from vp.sharma to actual recruiters.

Safe to leave in the start command — no-ops once ownership is already fixed.
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from users.models import User, Role
from candidates.models import Candidate
from submittals.models import Submittal


class Command(BaseCommand):
    help = "Reassign candidate/submittal ownership to actual recruiters"

    def handle(self, *args, **kwargs):
        vp_ids = list(User.objects.filter(role__in=[Role.VP, Role.CEO]).values_list("id", flat=True))
        if not vp_ids:
            self.stdout.write("No VP/CEO users — skipping.")
            return

        vp_owned = Candidate.objects.filter(created_by_id__in=vp_ids).count()
        if vp_owned == 0:
            self.stdout.write("Ownership already fixed — skipping.")
            return

        recruiters = list(User.objects.filter(role=Role.RECRUITER).order_by("id"))
        if not recruiters:
            self.stdout.write("No recruiters found — aborting.")
            return

        candidates = list(Candidate.objects.order_by("id"))
        submittals = list(Submittal.objects.order_by("id"))

        self.stdout.write(f"Recruiters: {len(recruiters)}, Candidates: {len(candidates)}, Submittals: {len(submittals)}")

        with transaction.atomic():
            for i, c in enumerate(candidates):
                c.created_by = recruiters[i % len(recruiters)]
            Candidate.objects.bulk_update(candidates, ["created_by"])

            for i, s in enumerate(submittals):
                s.submitted_by = recruiters[i % len(recruiters)]
            Submittal.objects.bulk_update(submittals, ["submitted_by"])

        self.stdout.write("Done. Ownership reassigned.")
