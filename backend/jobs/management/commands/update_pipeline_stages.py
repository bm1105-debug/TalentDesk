from django.core.management.base import BaseCommand
from jobs.models import Job, PipelineStage, DEFAULT_PIPELINE
from submittals.models import Submittal

# Map old stage names (by order position) to the nearest new stage order
OLD_TO_NEW_ORDER = {
    0: 0,  # Screening   → Screened
    1: 3,  # Interview   → L1 Interview
    2: 4,  # Technical Assessment → L2 Interview
    3: 5,  # Offer       → Offer Released
    4: 7,  # Placed      → Joined (will be caught by placed status anyway)
}


class Command(BaseCommand):
    help = 'Replace per-job pipeline stages with the 8 standard funnel stages and remap existing submittals'

    def handle(self, *args, **options):
        jobs = list(Job.objects.all())

        # ── 1. Save current submittal → old stage order mapping before deletion ──
        # We need this BEFORE we delete old stages
        submittal_stage_map = {}  # submittal_id → old stage order
        for s in Submittal.objects.select_related('current_stage').filter(current_stage__isnull=False):
            submittal_stage_map[s.id] = s.current_stage.order

        # ── 2. Delete all existing pipeline stages ──
        PipelineStage.objects.filter(job__in=jobs).delete()
        self.stdout.write(f'Deleted old stages for {len(jobs)} jobs.')

        # ── 3. Create new 8-stage pipeline for every job ──
        new_stages = []
        for job in jobs:
            for order, name in enumerate(DEFAULT_PIPELINE):
                new_stages.append(PipelineStage(job=job, name=name, order=order))
        PipelineStage.objects.bulk_create(new_stages)
        self.stdout.write(f'Created {len(new_stages)} new stages ({len(DEFAULT_PIPELINE)} per job).')

        # ── 4. Remap each submittal to the equivalent new stage ──
        # Build a lookup: (job_id, order) → new PipelineStage
        stage_lookup = {
            (ps.job_id, ps.order): ps
            for ps in PipelineStage.objects.all()
        }

        updated = 0
        for submittal in Submittal.objects.select_related('job').all():
            old_order   = submittal_stage_map.get(submittal.id)
            new_order   = OLD_TO_NEW_ORDER.get(old_order, 0) if old_order is not None else 0
            new_stage   = stage_lookup.get((submittal.job_id, new_order))
            if new_stage:
                submittal.current_stage = new_stage
                submittal.save(update_fields=['current_stage'])
                updated += 1

        self.stdout.write(self.style.SUCCESS(
            f'Remapped {updated} submittals to new pipeline stages.'
        ))
