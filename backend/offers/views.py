# offers/views.py

from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Offer
from .serializers import OfferSerializer, OfferActionSerializer
from users.permissions import IsAccountManagerOrAbove, IsRecruiterOrAbove


class OfferViewSet(viewsets.ModelViewSet):
    serializer_class = OfferSerializer
    filter_backends  = [filters.OrderingFilter]
    ordering_fields  = ["offer_date", "created_at", "status"]
    ordering         = ["-created_at"]

    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = Offer.objects.select_related(
            "submittal__candidate",
            "submittal__job__client",
            "created_by",
        )

        submittal_id = self.request.query_params.get("submittal")
        candidate_id = self.request.query_params.get("candidate")
        status_param = self.request.query_params.get("status")

        if submittal_id:
            qs = qs.filter(submittal_id=submittal_id)
        if candidate_id:
            qs = qs.filter(submittal__candidate_id=candidate_id)
        if status_param:
            qs = qs.filter(status=status_param)

        return qs

    def get_permissions(self):
        if self.action == "destroy":
            return [IsAccountManagerOrAbove()]
        return [IsRecruiterOrAbove()]

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        """POST /api/offers/{id}/accept/ — accept offer and auto-place submittal."""
        offer = self.get_object()

        if offer.status != Offer.Status.PENDING:
            return Response(
                {"detail": "Only a pending offer can be accepted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = OfferActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        offer.accept(actor=request.user)
        return Response(OfferSerializer(offer, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def decline(self, request, pk=None):
        """POST /api/offers/{id}/decline/ — candidate declined the offer."""
        offer = self.get_object()

        if offer.status != Offer.Status.PENDING:
            return Response(
                {"detail": "Only a pending offer can be declined."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = OfferActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        offer.decline(actor=request.user, notes=serializer.validated_data["notes"])
        return Response(OfferSerializer(offer, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def withdraw(self, request, pk=None):
        """POST /api/offers/{id}/withdraw/ — firm withdrew the offer."""
        offer = self.get_object()

        if offer.status != Offer.Status.PENDING:
            return Response(
                {"detail": "Only a pending offer can be withdrawn."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = OfferActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        offer.withdraw(actor=request.user, notes=serializer.validated_data["notes"])
        return Response(OfferSerializer(offer, context={"request": request}).data)
