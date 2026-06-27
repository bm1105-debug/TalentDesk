'''
Four thin views — each validates input, calls a serializer or queryset, returns a response. No business logic lives here.

- RegisterView — CEO-only user creation
- MeView — returns the logged-in user's profile
- ChangePasswordView — changes own password
- UserListView — CEO/Account Manager can list and update users
- AdminPasswordResetView — VP/CEO can reset any user's password

'''

import secrets
import string

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from users.models import User
from users.permissions import IsVPOrAbove, IsTeamLeadOrAbove
from users.serializers import RegisterSerializer, UserSerializer, ChangePasswordSerializer, MeUpdateSerializer

class RegisterView(generics.CreateAPIView):
    """
    POST /api/users/register/
    Creates a new staff user. Account Manager and CEO only.
    """
    serializer_class = RegisterSerializer
    permission_classes = [IsVPOrAbove]

class MeView(APIView):
    """
    GET   /api/users/me/ — return own profile
    PATCH /api/users/me/ — update own first_name, last_name, email, phone
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = MeUpdateSerializer(
            request.user, data=request.data, partial=True, context={"request": request}
        )
        if serializer.is_valid():
            serializer.save()
            return Response(UserSerializer(request.user).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class ChangePasswordView(APIView):
    """
    POST /api/users/change-password/
    Any authenticated user can change their own password.
    Old password is verified before accepting the new one.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # Pass request via context so the serializer can access request.user
        serializer = ChangePasswordSerializer(
            data=request.data, context={"request": request}
        )
        if serializer.is_valid():
            serializer.save()
            return Response({"detail": "Password updated."})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
class UserListView(generics.ListAPIView):
    """
    GET /api/users/
    - CEO / VP: all users
    - Team Lead: own direct reports only
    """
    serializer_class = UserSerializer
    permission_classes = [IsTeamLeadOrAbove]

    def get_queryset(self):
        from users.models import Role
        user = self.request.user
        if user.can_manage_all():
            return User.objects.all().order_by("last_name")
        if user.role == Role.TEAM_LEAD:
            return User.objects.filter(reports_to=user).order_by("last_name")
        return User.objects.none()

class UserDetailView(generics.RetrieveUpdateAPIView):
    """
    GET   /api/users/<id>/   — retrieve a single user
    PATCH /api/users/<id>/   — update role, is_active, reports_to (AM and CEO)
    """
    permission_classes = [IsVPOrAbove]
    serializer_class = UserSerializer

    def get_queryset(self):
        user = self.request.user
        if user.can_manage_all():
            return User.objects.all()
        from users.models import Role
        return User.objects.filter(role__in=[Role.RECRUITER, Role.TEAM_LEAD])

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            from rest_framework import serializers as drf_serializers
            from users.models import Role as _Role

            class WritableUserSerializer(UserSerializer):
                class Meta(UserSerializer.Meta):
                    read_only_fields = (
                        "id", "username", "email", "first_name",
                        "last_name", "phone", "date_joined",
                    )

                def validate_reports_to(self, value):
                    if value and value.role != _Role.TEAM_LEAD:
                        raise drf_serializers.ValidationError(
                            "reports_to must reference a Team Lead."
                        )
                    return value

            return WritableUserSerializer
        return UserSerializer


class AdminPasswordResetView(APIView):
    """
    POST /api/users/<id>/reset-password/
    VP/CEO generates a random temporary password for any user.
    Returns the temp password in the response — share it securely with the user.
    """
    permission_classes = [IsVPOrAbove]

    def post(self, request, pk):
        target = get_object_or_404(User, pk=pk)
        alphabet = string.ascii_letters + string.digits + "!@#$"
        temp_password = "".join(secrets.choice(alphabet) for _ in range(12))
        target.set_password(temp_password)
        target.save(update_fields=["password"])
        return Response({"temp_password": temp_password})
