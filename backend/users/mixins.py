from users.models import Role


class RoleQuerysetMixin:
    """
    Mixin for DRF ViewSets that provides role-aware queryset scoping.

    Call allowed_author_ids() to get the set of user PKs whose records
    the requesting user may access:
      - Recruiter  → {own PK}
      - Team Lead  → {own PK} ∪ {direct report PKs}
      - AM / CEO   → None  (no filter — full access)

    None signals "no filter needed" so callers can skip the DB hit entirely
    for managers rather than fetching all user IDs.
    """

    def allowed_author_ids(self):
        if hasattr(self.request, '_pod_ids'):
            return self.request._pod_ids
        user = self.request.user
        if not user.is_authenticated:
            self.request._pod_ids = None
            return None
        if user.role == Role.RECRUITER:
            result = {user.pk}
        elif user.role == Role.TEAM_LEAD:
            pod = set(user.direct_reports.values_list('pk', flat=True))
            pod.add(user.pk)
            result = pod
        else:
            result = None  # AM / CEO — unrestricted
        self.request._pod_ids = result
        return result

    def is_manager(self):
        user = self.request.user
        return user.is_authenticated and user.role in (Role.VP, Role.CEO)
