''' 
Reusable DRF permission classes for role-based access control. 
Every view imports from here — role checks never live inside business logic. 
Each class is additive (CEO passes all of them).
'''

from rest_framework.permissions import BasePermission
from users.models import Role

class IsCEO(BasePermission):
    """Only CEO / Admin can access."""
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role == Role.CEO
        )
    
class IsAccountManagerOrAbove(BasePermission):
    """Account Manager and CEO."""
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in (Role.ACCOUNT_MANAGER, Role.CEO)
        )

class IsTeamLeadOrAbove(BasePermission):
    """Team Lead, Account Manager, and CEO."""
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in (
                Role.TEAM_LEAD,
                Role.ACCOUNT_MANAGER,
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
                Role.ACCOUNT_MANAGER,
                Role.CEO,
            )
        )