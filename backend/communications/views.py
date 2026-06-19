'''
Defines three viewsets — template CRUD for managers, 
a send endpoint that renders + dispatches + logs in one atomic operation, 
and a read-only log of all sent emails. The send action wraps SMTP in a try/except 
so a delivery failure writes a failed log entry rather than crashing the request.

'''

from django.core.mail import send_mail
from django.conf import settings

from rest_framework import viewsets, filters, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.mixins import ListModelMixin, RetrieveModelMixin
from rest_framework.viewsets import GenericViewSet

from .models import EmailTemplate, SentEmail
from .serializers import (
    EmailTemplateSerializer,
    SendEmailSerializer,
    PreviewEmailSerializer,
    SentEmailSerializer,
)
from users.permissions import IsRecruiterOrAbove, IsVPOrAbove
from candidates.models import Candidate
from jobs.models import Job


class EmailTemplateViewSet(viewsets.ModelViewSet):
    """
    Full CRUD for email templates.
    Only managers can create/edit/delete — recruiters can read and preview.
    """
    serializer_class = EmailTemplateSerializer
    queryset         = EmailTemplate.objects.select_related("created_by")
    filter_backends  = [filters.SearchFilter]
    search_fields    = ["name", "subject", "template_type"]

    def get_permissions(self):
        # Recruiters need read access to pick a template before sending
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsVPOrAbove()]
        return [IsRecruiterOrAbove()]


class SendEmailView(APIView):
    """
    POST /api/communications/send/
    Renders the template, fires the SMTP email, and writes a SentEmail log.
    Always returns 200 — delivery failures are logged as status='failed'
    rather than returning a 500 so the recruiter gets a clear error message.
    """
    permission_classes = [IsRecruiterOrAbove]

    def post(self, request):
        serializer = SendEmailSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)

        data             = serializer.validated_data
        template_obj     = serializer.context["template_obj"]
        rendered_subject = serializer.context["rendered_subject"]
        rendered_body    = serializer.context["rendered_body"]

        # Resolve optional FK IDs to model instances
        candidate = None
        job       = None
        if data["related_candidate"]:
            try:
                candidate = Candidate.objects.get(id=data["related_candidate"])
            except Candidate.DoesNotExist:
                pass
        if data["related_job"]:
            try:
                job = Job.objects.get(id=data["related_job"])
            except Job.DoesNotExist:
                pass

        send_status   = SentEmail.SendStatus.SENT
        error_message = ""

        try:
            # Django's send_mail uses the SMTP backend configured in settings
            send_mail(
                subject      = rendered_subject,
                message      = rendered_body,   # plain text fallback
                from_email   = settings.DEFAULT_FROM_EMAIL,
                recipient_list = [data["to_email"]],
                html_message = rendered_body,   # also send as HTML
                fail_silently = False,
            )
        except Exception as e:
            # Catch ALL SMTP exceptions — log the failure rather than crashing
            send_status   = SentEmail.SendStatus.FAILED
            error_message = str(e)

        # Write the immutable audit record regardless of send outcome
        log = SentEmail.objects.create(
            template          = template_obj,
            to_email          = data["to_email"],
            to_name           = data["to_name"],
            subject           = rendered_subject,
            body              = rendered_body,
            related_candidate = candidate,
            related_job       = job,
            status            = send_status,
            error_message     = error_message,
            sent_by           = request.user,
        )

        # Return the log entry so the frontend can show delivery confirmation
        return Response(
            SentEmailSerializer(log).data,
            status=status.HTTP_200_OK,
        )


class PreviewEmailView(APIView):
    """
    POST /api/communications/preview/
    Renders the template with the given context and returns the result
    without sending anything. Lets recruiters proofread before firing.
    """
    permission_classes = [IsRecruiterOrAbove]

    def post(self, request):
        serializer = PreviewEmailSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)

        return Response({
            "subject": serializer.context["rendered_subject"],
            "body":    serializer.context["rendered_body"],
        })


class SentEmailViewSet(ListModelMixin, RetrieveModelMixin, GenericViewSet):
    """
    Read-only list and detail view of the sent email audit log.
    Managers only — contains recipient contact details.
    """
    serializer_class   = SentEmailSerializer
    permission_classes = [IsVPOrAbove]
    filter_backends    = [filters.SearchFilter, filters.OrderingFilter]
    search_fields      = ["to_email", "to_name", "subject"]
    ordering_fields    = ["sent_at", "status"]
    ordering           = ["-sent_at"]

    def get_queryset(self):
        qs = SentEmail.objects.select_related("template", "sent_by")

        # Filter by template, status, or candidate for audit queries
        template_id  = self.request.query_params.get("template")
        status_param = self.request.query_params.get("status")
        candidate_id = self.request.query_params.get("candidate")

        if template_id:
            qs = qs.filter(template_id=template_id)
        if status_param:
            qs = qs.filter(status=status_param)
        if candidate_id:
            qs = qs.filter(related_candidate_id=candidate_id)

        return qs
