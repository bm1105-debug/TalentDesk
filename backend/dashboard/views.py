from datetime import timedelta
from django.utils import timezone
from django.db.models import Q, Count
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from django.db.models import Avg
from jobs.models import Job
from submittals.models import Submittal
from jobs.serializers import JobSerializer
from submittals.serializers import SubmittalSerializer
from users.models import Role
from users.permissions import IsRecruiterOrAbove
from candidates.models import Candidate
from interviews.models import Interview
from offers.models import Offer



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

        # ── Pending offers (firm-wide — any recruiter needs to chase these) ───
        pending_offers_qs = (
            Offer.objects
            .filter(status=Offer.Status.PENDING)
            .select_related("submittal__candidate", "submittal__job__client", "created_by")
        )
        if not is_manager:
            pending_offers_qs = pending_offers_qs.filter(created_by=user)

        # ── Trends (current 7 days vs previous 7 days) ───────────────────────
        week_start = (now - timedelta(days=7)).date()
        prev_start = (now - timedelta(days=14)).date()

        def _trend(current: int, previous: int) -> dict:
            if previous == 0:
                return {"direction": "flat", "pct": 0}
            diff = current - previous
            pct = round(abs(diff) / previous * 100)
            direction = "up" if diff > 0 else ("down" if diff < 0 else "flat")
            return {"direction": direction, "pct": pct}

        trends = {
            "open_jobs": _trend(
                open_jobs_qs.filter(created_at__date__gte=week_start).count(),
                open_jobs_qs.filter(created_at__date__range=(prev_start, week_start)).count(),
            ),
            "active_submittals": _trend(
                active_submittals_qs.filter(created_at__date__gte=week_start).count(),
                active_submittals_qs.filter(created_at__date__range=(prev_start, week_start)).count(),
            ),
            "urgent_jobs": _trend(
                urgent_jobs.filter(created_at__date__gte=week_start).count(),
                urgent_jobs.filter(created_at__date__range=(prev_start, week_start)).count(),
            ),
            "overdue_jobs": _trend(
                overdue_jobs.filter(created_at__date__gte=week_start).count(),
                overdue_jobs.filter(created_at__date__range=(prev_start, week_start)).count(),
            ),
            "pending_offers": _trend(
                pending_offers_qs.filter(created_at__date__gte=week_start).count(),
                pending_offers_qs.filter(created_at__date__range=(prev_start, week_start)).count(),
            ),
        }

        # ── Today's interviews ────────────────────────────────────────────────
        today_qs = (
            Interview.objects
            .filter(scheduled_at__date=now.date(), status=Interview.Status.SCHEDULED)
            .select_related("submittal__candidate", "submittal__job__client")
            .order_by("scheduled_at")
        )
        if not is_manager:
            today_qs = today_qs.filter(
                Q(submittal__submitted_by=user) | Q(created_by=user)
            )

        interviews_today = [
            {
                "id":             i.id,
                "scheduled_at":   i.scheduled_at.isoformat(),
                "interview_type": i.interview_type,
                "candidate_name": f"{i.submittal.candidate.first_name} {i.submittal.candidate.last_name}",
                "job_title":      i.submittal.job.title,
                "client_name":    i.submittal.job.client.name,
                "meeting_link":   i.meeting_link,
                "location":       i.location,
            }
            for i in today_qs
        ]

        # ── Upcoming deadlines ─────────────────────────────────────────────────
        seven_days_out = now.date() + timedelta(days=7)
        three_days_out = now.date() + timedelta(days=3)

        jobs_due = open_jobs_qs.filter(
            target_date__isnull=False,
            target_date__gte=now.date(),
            target_date__lte=seven_days_out,
        ).order_by("target_date")[:5]

        expiring_offers_qs = (
            Offer.objects
            .filter(
                status=Offer.Status.PENDING,
                expiry_date__isnull=False,
                expiry_date__gte=now.date(),
                expiry_date__lte=three_days_out,
            )
            .select_related("submittal__candidate", "submittal__job")
            .order_by("expiry_date")[:5]
        )

        # ── Serialise ─────────────────────────────────────────────────────────
        return Response({
            "summary": {
                "open_jobs_count":          open_jobs_qs.count(),
                "active_submittals_count":  active_submittals_qs.count(),
                "urgent_jobs_count":        urgent_jobs.count(),
                "overdue_jobs_count":       overdue_jobs.count(),
                "stale_submittals_count":   stale_submittals.count(),
                "pending_offers_count":     pending_offers_qs.count(),
                "interviews_today_count":   today_qs.count(),
                "trends":                   trends,
            },
            "interviews_today": interviews_today,
            "upcoming_deadlines": {
                "jobs_due_soon": [
                    {
                        "id":          j.id,
                        "title":       j.title,
                        "client_name": j.client.name,
                        "priority":    j.priority,
                        "target_date": j.target_date.isoformat(),
                        "days_left":   (j.target_date - now.date()).days,
                    }
                    for j in jobs_due
                ],
                "offers_expiring_soon": [
                    {
                        "id":             o.id,
                        "candidate_name": f"{o.submittal.candidate.first_name} {o.submittal.candidate.last_name}",
                        "job_title":      o.submittal.job.title,
                        "expiry_date":    o.expiry_date.isoformat(),
                        "days_left":      (o.expiry_date - now.date()).days,
                    }
                    for o in expiring_offers_qs
                ],
            },
            "urgent_jobs":      [],
            "overdue_jobs":     [],
            "stale_submittals": [],
            "pending_offers":   [],
        })


class AnalyticsView(APIView):
    """
    GET /api/dashboard/analytics/
    Returns all seven analytics widget payloads. Each section starts as a
    null/empty stub; subsequent issues fill in the real aggregations one by one.
    """
    permission_classes = [IsRecruiterOrAbove]

    def get(self, request):
        # ── Candidate pool ────────────────────────────────────────────────────
        pool_qs = (
            Candidate.objects
            .values("status")
            .annotate(count=Count("id"))
        )
        pool_map = {row["status"]: row["count"] for row in pool_qs}
        candidate_pool = {
            "active":      pool_map.get("active",      0),
            "passive":     pool_map.get("passive",     0),
            "placed":      pool_map.get("placed",      0),
            "blacklisted": pool_map.get("blacklisted", 0),
        }

        # ── Source effectiveness ───────────────────────────────────────────────
        source_qs = (
            Candidate.objects
            .values("source")
            .annotate(
                candidates=Count("id"),
                placements=Count("id", filter=Q(status="placed")),
            )
            .order_by("-candidates")
        )
        source_effectiveness = [
            {
                "source":     row["source"],
                "candidates": row["candidates"],
                "placements": row["placements"],
            }
            for row in source_qs
        ]

        # ── Open jobs breakdown ───────────────────────────────────────────────
        non_cancelled_qs = Job.objects.exclude(status="cancelled")

        status_qs = non_cancelled_qs.values("status").annotate(count=Count("id"))
        status_map = {row["status"]: row["count"] for row in status_qs}

        priority_qs = non_cancelled_qs.values("priority").annotate(count=Count("id"))
        priority_map = {row["priority"]: row["count"] for row in priority_qs}

        open_jobs = {
            "by_status": {
                "open":    status_map.get("open",    0),
                "on_hold": status_map.get("on_hold", 0),
                "draft":   status_map.get("draft",   0),
                "filled":  status_map.get("filled",  0),
            },
            "by_priority": {
                "urgent": priority_map.get("urgent", 0),
                "high":   priority_map.get("high",   0),
                "medium": priority_map.get("medium", 0),
                "low":    priority_map.get("low",    0),
            },
        }

        # ── Recruiter leaderboard ─────────────────────────────────────────────
        leaderboard_qs = (
            Submittal.objects
            .exclude(submitted_by__isnull=True)
            .values("submitted_by", "submitted_by__first_name", "submitted_by__last_name")
            .annotate(
                active=Count("id", filter=Q(status="active")),
                placements=Count("id", filter=Q(status="placed")),
            )
            .order_by("-placements")
        )
        recruiter_leaderboard = [
            {
                "id":         row["submitted_by"],
                "name":       f"{row['submitted_by__first_name']} {row['submitted_by__last_name']}".strip(),
                "active":     row["active"],
                "placements": row["placements"],
            }
            for row in leaderboard_qs
        ]

        # ── Interview outcomes ────────────────────────────────────────────────
        outcome_qs = (
            Interview.objects
            .values("status")
            .annotate(count=Count("id"))
        )
        outcome_map = {row["status"]: row["count"] for row in outcome_qs}

        raw_avg = Interview.objects.filter(score__isnull=False).aggregate(avg=Avg("score"))["avg"]
        avg_score = round(raw_avg, 1) if raw_avg is not None else None

        interview_outcomes = {
            "completed": outcome_map.get("completed", 0),
            "cancelled":  outcome_map.get("cancelled",  0),
            "no_show":    outcome_map.get("no_show",    0),
            "avg_score":  avg_score,
        }

        # ── Pipeline funnel ───────────────────────────────────────────────────
        funnel_qs = (
            Submittal.objects
            .filter(status="active", current_stage__isnull=False)
            .values("current_stage__name", "current_stage__order")
            .annotate(count=Count("id"))
            .order_by("current_stage__order")
        )
        pipeline_funnel = [
            {"stage": row["current_stage__name"], "count": row["count"]}
            for row in funnel_qs
        ]

        # ── Time to fill ──────────────────────────────────────────────────────
        # For each job with a placed submittal, find the earliest placement date
        from django.db.models import Min

        placed_qs = (
            Submittal.objects
            .filter(status="placed")
            .values("job_id")
            .annotate(first_placed_at=Min("updated_at"))
        )
        job_ids = [row["job_id"] for row in placed_qs]
        job_lookup = {
            j.id: j
            for j in Job.objects.filter(id__in=job_ids).select_related("client")
        }

        by_job = []
        for row in placed_qs:
            job = job_lookup.get(row["job_id"])
            if not job:
                continue
            days = max((row["first_placed_at"] - job.created_at).days, 0)
            by_job.append({"id": job.id, "title": job.title, "client": job.client.name, "days": days})

        by_job.sort(key=lambda x: x["days"], reverse=True)
        avg_days = round(sum(r["days"] for r in by_job) / len(by_job)) if by_job else None

        time_to_fill = {"avg_days": avg_days, "by_job": by_job}

        return Response({
            "candidate_pool":        candidate_pool,
            "source_effectiveness":  source_effectiveness,
            "open_jobs":             open_jobs,
            "recruiter_leaderboard": recruiter_leaderboard,
            "interview_outcomes":    interview_outcomes,
            "pipeline_funnel":       pipeline_funnel,
            "time_to_fill":          time_to_fill,
        })


class ScorecardView(APIView):
    """
    GET /api/dashboard/scorecard/
    Returns pipeline stats scoped to the logged-in user only.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        my_qs = Submittal.objects.filter(submitted_by=user)

        total     = my_qs.count()
        active    = my_qs.filter(status="active").count()
        placed    = my_qs.filter(status="placed").count()
        rejected  = my_qs.filter(status="rejected").count()
        withdrawn = my_qs.filter(status="withdrawn").count()
        conversion_rate = round((placed / total) * 100, 1) if total > 0 else 0.0

        # Pipeline: my active submittals by stage
        funnel_qs = (
            my_qs
            .filter(status="active", current_stage__isnull=False)
            .values("current_stage__name", "current_stage__order")
            .annotate(count=Count("id"))
            .order_by("current_stage__order")
        )
        pipeline = [
            {"stage": row["current_stage__name"], "count": row["count"]}
            for row in funnel_qs
        ]

        # Recent placements — last 5
        recent_qs = (
            my_qs
            .filter(status="placed")
            .select_related("candidate", "job")
            .order_by("-updated_at")[:5]
        )
        recent_placements = [
            {
                "candidate": f"{s.candidate.first_name} {s.candidate.last_name}",
                "job":       s.job.title,
                "placed_at": s.updated_at.date().isoformat(),
            }
            for s in recent_qs
        ]

        return Response({
            "stats": {
                "total":           total,
                "active":          active,
                "placed":          placed,
                "rejected":        rejected,
                "withdrawn":       withdrawn,
                "conversion_rate": conversion_rate,
            },
            "pipeline":          pipeline,
            "recent_placements": recent_placements,
        })
