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
from users.permissions import IsCEO, IsAccountManagerOrAbove, IsTeamLeadOrAbove
from users.serializers import RegisterSerializer, UserSerializer, ChangePasswordSerializer

class RegisterView(generics.CreateAPIView):
    """
    POST /api/users/register/
    Creates a new staff user. Account Manager and CEO only.
    """
    serializer_class = RegisterSerializer
    permission_classes = [IsAccountManagerOrAbove]

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
    GET /api/users/
    - CEO: all users
    - Account Manager: recruiters and team leads
    - Team Lead: own direct reports only
    """
    serializer_class = UserSerializer
    permission_classes = [IsTeamLeadOrAbove]

    def get_queryset(self):
        from users.models import Role
        user = self.request.user
        if user.is_ceo:
            return User.objects.all().order_by("last_name")
        if user.role == Role.TEAM_LEAD:
            return User.objects.filter(reports_to=user).order_by("last_name")
        # Account Manager
        return User.objects.filter(
            role__in=[Role.RECRUITER, Role.TEAM_LEAD]
        ).order_by("last_name")

class UserDetailView(generics.RetrieveUpdateAPIView):
    """
    GET   /api/users/<id>/   — retrieve a single user
    PATCH /api/users/<id>/   — update role, is_active, reports_to (AM and CEO)
    """
    permission_classes = [IsAccountManagerOrAbove]
    serializer_class = UserSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_ceo:
            return User.objects.all()
        # Account managers can only edit recruiters and team leads, not other managers
        from users.models import Role
        return User.objects.filter(role__in=[Role.RECRUITER, Role.TEAM_LEAD])

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            class WritableUserSerializer(UserSerializer):
                class Meta(UserSerializer.Meta):
                    read_only_fields = (
                        "id", "username", "email", "first_name",
                        "last_name", "phone", "date_joined",
                    )
            return WritableUserSerializer
        return UserSerializer
