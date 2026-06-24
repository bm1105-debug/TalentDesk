from datetime import timedelta
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db.models import Q, Count, Avg, Min, OuterRef, Subquery, ExpressionWrapper, F, DurationField
from django.db.models.functions import TruncMonth
from django.conf import settings as django_settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from jobs.models import Job
from submittals.models import Submittal
from jobs.serializers import JobSerializer
from submittals.serializers import SubmittalSerializer
from users.models import User, Role
from users.permissions import IsRecruiterOrAbove, IsTeamLeadOrAbove, IsVPOrAbove
from candidates.models import Candidate
from interviews.models import Interview
from offers.models import Offer





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
        is_manager = user.role in (Role.VP, Role.CEO, Role.TEAM_LEAD)
        now = timezone.now()
        stale_cutoff = now - timedelta(days=django_settings.STALE_SUBMITTAL_DAYS)

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

        # Stale = active submittal with no movement for STALE_SUBMITTAL_DAYS days
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
            "urgent_jobs":      [{"id": j.id, "title": j.title, "client": j.client.name, "priority": j.priority} for j in urgent_jobs],
            "overdue_jobs":     [{"id": j.id, "title": j.title, "client": j.client.name, "target_date": j.target_date.isoformat() if j.target_date else None} for j in overdue_jobs],
            "stale_submittals": [{"id": s.id, "candidate": f"{s.candidate.first_name} {s.candidate.last_name}", "job": s.job.title, "updated_at": s.updated_at.isoformat()} for s in stale_submittals],
            "pending_offers":   [{"id": o.id, "candidate": f"{o.submittal.candidate.first_name} {o.submittal.candidate.last_name}", "job": o.submittal.job.title} for o in pending_offers_qs],
        })


class AnalyticsView(APIView):
    """
    GET /api/dashboard/analytics/
    Returns all seven analytics widget payloads. Each section starts as a
    null/empty stub; subsequent issues fill in the real aggregations one by one.
    """
    permission_classes = [IsVPOrAbove]

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


class UserAnalyticsView(APIView):
    """
    GET /api/dashboard/analytics/user/<user_id>/
    Returns all analytics widgets scoped to a single recruiter or team lead.
    Team Leads can only access their own direct reports. Returns 404 for non-recruiter/TL targets.
    """
    permission_classes = [IsTeamLeadOrAbove]

    def get(self, request, user_id):
        target = get_object_or_404(User, pk=user_id)
        if target.role not in (Role.RECRUITER, Role.TEAM_LEAD):
            return Response({"detail": "Not found."}, status=404)
        if request.user.role == Role.TEAM_LEAD and target not in request.user.direct_reports.all():
            return Response({"detail": "Forbidden."}, status=403)

        # ── Candidate pool ────────────────────────────────────────────────────
        pool_qs = (
            Candidate.objects.filter(created_by=target)
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
            Candidate.objects.filter(created_by=target)
            .values("source")
            .annotate(
                candidates=Count("id"),
                placements=Count("id", filter=Q(status="placed")),
            )
            .order_by("-candidates")
        )
        source_effectiveness = [
            {"source": row["source"], "candidates": row["candidates"], "placements": row["placements"]}
            for row in source_qs
        ]

        # ── Open jobs ─────────────────────────────────────────────────────────
        job_qs = Job.objects.filter(assigned_to=target).exclude(status="cancelled")
        status_map   = {r["status"]:   r["count"] for r in job_qs.values("status").annotate(count=Count("id"))}
        priority_map = {r["priority"]: r["count"] for r in job_qs.values("priority").annotate(count=Count("id"))}
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

        # ── Pipeline funnel ───────────────────────────────────────────────────
        sub_qs = Submittal.objects.filter(submitted_by=target)
        funnel_qs = (
            sub_qs
            .filter(status="active", current_stage__isnull=False)
            .values("current_stage__name", "current_stage__order")
            .annotate(count=Count("id"))
            .order_by("current_stage__order")
        )
        pipeline_funnel = [
            {"stage": row["current_stage__name"], "count": row["count"]}
            for row in funnel_qs
        ]

        # ── Interview outcomes ────────────────────────────────────────────────
        iv_qs      = Interview.objects.filter(created_by=target)
        outcome_map = {r["status"]: r["count"] for r in iv_qs.values("status").annotate(count=Count("id"))}
        raw_avg    = iv_qs.filter(score__isnull=False).aggregate(avg=Avg("score"))["avg"]
        interview_outcomes = {
            "completed": outcome_map.get("completed", 0),
            "cancelled":  outcome_map.get("cancelled",  0),
            "no_show":    outcome_map.get("no_show",    0),
            "avg_score":  round(raw_avg, 1) if raw_avg is not None else None,
        }

        # ── Time to fill ──────────────────────────────────────────────────────
        placed_qs = (
            sub_qs.filter(status="placed")
            .values("job_id")
            .annotate(first_placed_at=Min("updated_at"))
        )
        job_ids    = [row["job_id"] for row in placed_qs]
        job_lookup = {j.id: j for j in Job.objects.filter(id__in=job_ids).select_related("client")}
        by_job = []
        for row in placed_qs:
            job = job_lookup.get(row["job_id"])
            if not job:
                continue
            days = max((row["first_placed_at"] - job.created_at).days, 0)
            by_job.append({"id": job.id, "title": job.title, "client": job.client.name, "days": days})
        by_job.sort(key=lambda x: x["days"], reverse=True)
        avg_days     = round(sum(r["days"] for r in by_job) / len(by_job)) if by_job else None
        time_to_fill = {"avg_days": avg_days, "by_job": by_job}

        # ── Recruiter stats (replaces leaderboard for per-user view) ──────────
        total  = sub_qs.count()
        placed = sub_qs.filter(status="placed").count()
        recruiter_stats = {
            "total":           total,
            "active":          sub_qs.filter(status="active").count(),
            "placed":          placed,
            "conversion_rate": round((placed / total) * 100, 1) if total > 0 else 0.0,
        }

        return Response({
            "candidate_pool":       candidate_pool,
            "source_effectiveness": source_effectiveness,
            "open_jobs":            open_jobs,
            "pipeline_funnel":      pipeline_funnel,
            "interview_outcomes":   interview_outcomes,
            "time_to_fill":         time_to_fill,
            "recruiter_stats":      recruiter_stats,
        })


class ConversionFunnelView(APIView):
    """
    GET /api/dashboard/conversion-funnel/
    Returns the 9-stage hiring conversion funnel with unique candidate counts
    at each gate. Stages 1-7 use current_stage__order cumulative counts so
    the funnel directly reflects where submittals sit in the pipeline.

    Pipeline order:
      0 Screened | 1 Submitted | 2 Shortlisted | 3 L1 Interview |
      4 L2 Interview | 5 Offer Released | 6 Offer Accepted | 7 Joined
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        client_id = request.query_params.get("client")

        def at_or_beyond(order):
            qs = Submittal.objects.filter(
                current_stage__order__gte=order,
                status__in=['active', 'placed'],
            )
            if client_id:
                qs = qs.filter(job__client_id=client_id)
            return qs.values('candidate').distinct().count()

        pipeline_stages = [
            {"stage": "Screened",       "count": at_or_beyond(0)},
            {"stage": "Submitted",      "count": at_or_beyond(1)},
            {"stage": "Shortlisted",    "count": at_or_beyond(2)},
            {"stage": "L1 Interview",   "count": at_or_beyond(3)},
            {"stage": "L2 Interview",   "count": at_or_beyond(4)},
            {"stage": "Offer Released", "count": at_or_beyond(5)},
            {"stage": "Offer Accepted", "count": at_or_beyond(6)},
        ]

        placed_qs = Submittal.objects.filter(status='placed')
        if client_id:
            placed_qs = placed_qs.filter(job__client_id=client_id)
        joined_count = placed_qs.values('candidate').distinct().count()

        if client_id:
            # "Sourced" is not client-scoped (candidates are not owned by a single client).
            stages = pipeline_stages + [{"stage": "Joined", "count": joined_count}]
        else:
            stages = (
                [{"stage": "Sourced", "count": Candidate.objects.count()}]
                + pipeline_stages
                + [{"stage": "Joined", "count": joined_count}]
            )

        return Response({"stages": stages})


class TimeToFillTrendView(APIView):
    """
    GET /api/dashboard/time-to-fill-trend/
    Returns avg days from submittal creation to placement, grouped by month,
    for the last 6 months. Optional ?client=<id> filter.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        six_months_ago = timezone.now() - timedelta(days=180)

        qs = Submittal.objects.filter(
            status="placed",
            updated_at__gte=six_months_ago,
        )

        client_id = request.query_params.get("client")
        if client_id:
            qs = qs.filter(job__client_id=client_id)

        duration_expr = ExpressionWrapper(
            F("updated_at") - F("created_at"),
            output_field=DurationField(),
        )

        rows = (
            qs
            .annotate(month=TruncMonth("updated_at"))
            .values("month")
            .annotate(avg_duration=Avg(duration_expr), count=Count("id"))
            .order_by("month")
        )

        trend = []
        for row in rows:
            if row["avg_duration"] is None:
                continue
            trend.append({
                "month":    row["month"].strftime("%b %Y"),
                "avg_days": max(row["avg_duration"].days, 0),
                "count":    row["count"],
            })

        overall = qs.aggregate(avg_duration=Avg(duration_expr))
        overall_days = (
            max(overall["avg_duration"].days, 0)
            if overall["avg_duration"] is not None else None
        )

        return Response({"trend": trend, "avg_days": overall_days})


REASON_LABELS = {
    "salary":     "Salary mismatch",
    "experience": "Insufficient experience",
    "technical":  "Technical fit",
    "culture":    "Culture fit",
    "other":      "Other",
}


class DeclineReasonsView(APIView):
    """
    GET /api/dashboard/decline-reasons/
    Returns a breakdown of rejection reasons for closed submittals.
    Optional ?client=<id> filter.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Submittal.objects.filter(
            status=Submittal.SubmittalStatus.REJECTED,
            rejection_reason__gt="",  # only structured reasons, not blank
        )

        client_id = request.query_params.get("client")
        if client_id:
            qs = qs.filter(job__client_id=client_id)

        rows = (
            qs
            .values("rejection_reason")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        total = sum(r["count"] for r in rows)
        reasons = [
            {
                "reason":  row["rejection_reason"],
                "label":   REASON_LABELS.get(row["rejection_reason"], row["rejection_reason"].title()),
                "count":   row["count"],
                "percent": round(row["count"] / total * 100, 1) if total else 0,
            }
            for row in rows
        ]

        return Response({"reasons": reasons, "total": total})


class DiversityView(APIView):
    """
    GET /api/dashboard/diversity/
    Returns hired (placed) candidate gender breakdown per client.
    Optional ?client=<id> filter narrows to a single client.
    """
    permission_classes = [IsAuthenticated]

    GENDERS = ["female", "male", "non_binary", "prefer_not_to_say"]

    def get(self, request):
        qs = Submittal.objects.filter(
            status="placed",
            candidate__gender__gt="",
        ).select_related("job__client", "candidate")

        client_id = request.query_params.get("client")
        if client_id:
            qs = qs.filter(job__client_id=client_id)

        # Aggregate: client × gender → count
        rows = (
            qs
            .values("job__client_id", "job__client__name", "candidate__gender")
            .annotate(count=Count("id"))
        )

        # Pivot into {client_id: {name, female, male, ...}}
        clients: dict = {}
        for row in rows:
            cid  = row["job__client_id"]
            name = row["job__client__name"]
            g    = row["candidate__gender"]
            if cid not in clients:
                clients[cid] = {"client_id": cid, "client": name,
                                 "female": 0, "male": 0, "non_binary": 0, "prefer_not_to_say": 0}
            if g in clients[cid]:
                clients[cid][g] += row["count"]

        by_client = sorted(clients.values(), key=lambda x: x["client"])

        # Firm-wide totals
        totals = {g: sum(c[g] for c in by_client) for g in self.GENDERS}

        return Response({"by_client": by_client, "totals": totals})


class HiringKpisView(APIView):
    """
    GET /api/dashboard/hiring-kpis/
    KPI tiles for the Syncfusion-style dashboard: time to fill, offer stats, pipeline counts.
    Optional ?client=<id> filter.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        client_id = request.query_params.get("client")

        # Average time to fill (placed submittals)
        placed_qs = Submittal.objects.filter(status=Submittal.SubmittalStatus.PLACED)
        if client_id:
            placed_qs = placed_qs.filter(job__client_id=client_id)
        placed_qs = placed_qs.annotate(
            duration=ExpressionWrapper(F("updated_at") - F("created_at"), output_field=DurationField())
        )
        agg = placed_qs.aggregate(avg_dur=Avg("duration"))
        avg_days = round(agg["avg_dur"].days) if agg["avg_dur"] is not None else None

        # Offers
        offers_qs = Offer.objects.all()
        if client_id:
            offers_qs = offers_qs.filter(submittal__job__client_id=client_id)
        offers_provided = offers_qs.count()
        offers_accepted = offers_qs.filter(status=Offer.Status.ACCEPTED).count()
        acceptance_rate = round(offers_accepted / offers_provided * 100) if offers_provided else None

        # Submittal pipeline counts
        sub_qs = Submittal.objects.all()
        if client_id:
            sub_qs = sub_qs.filter(job__client_id=client_id)
        shortlisted_count = sub_qs.filter(current_stage__name__iexact="shortlisted").count()
        rejected_count = sub_qs.filter(status=Submittal.SubmittalStatus.REJECTED).count()

        return Response({
            "avg_time_to_fill_days": avg_days,
            "offers_provided":       offers_provided,
            "offers_accepted":       offers_accepted,
            "acceptance_rate":       acceptance_rate,
            "shortlisted_count":     shortlisted_count,
            "rejected_count":        rejected_count,
        })
