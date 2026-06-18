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
        user = self.request.user
        if user.role == Role.RECRUITER:
            return {user.pk}
        if user.role == Role.TEAM_LEAD:
            pod = set(user.direct_reports.values_list('pk', flat=True))
            pod.add(user.pk)
            return pod
        return None  # AM / CEO — unrestricted

    def is_manager(self):
        return self.request.user.role in (Role.ACCOUNT_MANAGER, Role.CEO)
