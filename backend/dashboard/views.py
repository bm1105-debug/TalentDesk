from datetime import timedelta
from django.utils import timezone
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from jobs.models import Job
from submittals.models import Submittal
from jobs.serializers import JobSerializer
from submittals.serializers import SubmittalSerializer
from users.models import Role


# Submittals with no movement for this many days are flagged as stale
STALE_DAYS = 7


class MyDayView(APIView):
    """
    GET /api/dashboard/my-day/
    Returns a personalised action queue for the logged-in user.
    Recruiter sees their own jobs/submittals.
    Manager/CEO sees firm-wide alerts.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        is_manager = user.role in (Role.ACCOUNT_MANAGER, Role.CEO, Role.TEAM_LEAD)
        now = timezone.now()
        stale_cutoff = now - timedelta(days=STALE_DAYS)

        # ── Jobs scope ────────────────────────────────────────────────────────
        # Managers see all open jobs; recruiters see only jobs assigned to them
        if is_manager:
            open_jobs_qs = Job.objects.filter(status=Job.Status.OPEN) \
                               .select_related("client", "created_by") \
                               .prefetch_related("stages", "assigned_to")
        else:
            open_jobs_qs = Job.objects.filter(
                status=Job.Status.OPEN, assigned_to=user
            ).select_related("client", "created_by").prefetch_related("stages", "assigned_to")

        # Urgent = explicitly marked urgent
        urgent_jobs = open_jobs_qs.filter(priority=Job.Priority.URGENT)

        # Overdue = past target date and still open
        overdue_jobs = open_jobs_qs.filter(
            target_date__lt=now.date(),
            target_date__isnull=False,
        )

        # ── Submittals scope ──────────────────────────────────────────────────
        # Managers see all active submittals; recruiters see their own
        if is_manager:
            active_submittals_qs = Submittal.objects.filter(
                status=Submittal.SubmittalStatus.ACTIVE
            ).select_related("candidate", "job", "current_stage", "submitted_by") \
             .prefetch_related("events__from_stage", "events__to_stage", "events__created_by")
        else:
            active_submittals_qs = Submittal.objects.filter(
                status=Submittal.SubmittalStatus.ACTIVE,
                submitted_by=user,
            ).select_related("candidate", "job", "current_stage", "submitted_by") \
             .prefetch_related("events__from_stage", "events__to_stage", "events__created_by")

        # Stale = active submittal with no movement for STALE_DAYS days
        stale_submittals = active_submittals_qs.filter(updated_at__lt=stale_cutoff)

        # ── Serialise ─────────────────────────────────────────────────────────
        ctx = {"request": request}

        return Response({
            "summary": {
                "open_jobs_count":          open_jobs_qs.count(),
                "active_submittals_count":  active_submittals_qs.count(),
                "urgent_jobs_count":        urgent_jobs.count(),
                "overdue_jobs_count":       overdue_jobs.count(),
                "stale_submittals_count":   stale_submittals.count(),
            },
            # Full objects so the frontend can render action cards directly
            "urgent_jobs":       JobSerializer(urgent_jobs,       many=True, context=ctx).data,
            "overdue_jobs":      JobSerializer(overdue_jobs,      many=True, context=ctx).data,
            "stale_submittals":  SubmittalSerializer(stale_submittals, many=True, context=ctx).data,
        })
