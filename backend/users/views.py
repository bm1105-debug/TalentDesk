'''
Four thin views — each validates input, calls a serializer or queryset, returns a response. No business logic lives here.

- RegisterView — CEO-only user creation
- MeView — returns the logged-in user's profile
- ChangePasswordView — changes own password
- UserListView — CEO/Account Manager can list and update users

'''

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import User
from users.permissions import IsCEO, IsAccountManagerOrAbove
from users.serializers import RegisterSerializer, UserSerializer, ChangePasswordSerializer

class RegisterView(generics.CreateAPIView):
    """
    POST /api/users/register/
    Creates a new staff user. CEO-only — recruiters cannot self-register.
    """
    serializer_class = RegisterSerializer
    permission_classes = [IsCEO]

class MeView(APIView):
    """
    GET /api/users/me/
    Returns the currently authenticated user's profile.
    No query params — identity comes from the JWT token.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Serialize and return the user attached to the request token
        serializer = UserSerializer(request.user)
        return Response(serializer.data)

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
    GET  /api/users/          — list all users (CEO and Account Manager only)
    PATCH /api/users/<id>/    — update role or active status (CEO only)
    """
    serializer_class = UserSerializer
    permission_classes = [IsAccountManagerOrAbove]

    def get_queryset(self):
        # CEO sees everyone; Account Manager sees only recruiters and team leads
        # select_related not needed here (no FK on User), but filter at DB level
        user = self.request.user
        if user.is_ceo:
            return User.objects.all().order_by("last_name")
        # Account managers should not manage other account managers or the CEO
        from users.models import Role
        return User.objects.filter(
            role__in=[Role.RECRUITER, Role.TEAM_LEAD]
        ).order_by("last_name")

class UserDetailView(generics.RetrieveUpdateAPIView):
    """
    GET   /api/users/<id>/   — retrieve a single user
    PATCH /api/users/<id>/   — update role or is_active (CEO only)
    """
    permission_classes = [IsCEO]
    serializer_class = UserSerializer

    def get_queryset(self):
        # Scope to all users — CEO has full access
        return User.objects.all()

    def get_serializer_class(self):
        # On write, allow role and is_active to be changed
        # UserSerializer is read-only, so we return a writable version inline
        if self.request.method in ("PUT", "PATCH"):
            from rest_framework import serializers as drf_serializers

            class WritableUserSerializer(UserSerializer):
                class Meta(UserSerializer.Meta):
                    # Override to allow writes on these two fields only
                    read_only_fields = (
                        "id", "username", "email", "first_name",
                        "last_name", "phone", "date_joined",
                    )
            return WritableUserSerializer
        return UserSerializer
