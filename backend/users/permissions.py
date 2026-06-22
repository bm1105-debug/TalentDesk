'''
Reusable DRF permission classes for role-based access control.
Every view imports from here — role checks never live inside business logic.
Each class is additive (CEO passes all of them).
'''

from rest_framework.permissions import BasePermission
from users.models import Role

class IsVPOrAbove(BasePermission):
    """VP and CEO — full administrative access."""
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in (Role.VP, Role.CEO)
        )

class IsTeamLeadOrAbove(BasePermission):
    """Team Lead, VP, and CEO."""
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in (
                Role.TEAM_LEAD,
                Role.VP,
                Role.CEO,
            )
        )

class IsRecruiterOrAbove(BasePermission):
    """Any authenticated staff member (all roles)."""
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in (
                Role.RECRUITER,
                Role.TEAM_LEAD,
                Role.VP,
                Role.CEO,
            )
        )
