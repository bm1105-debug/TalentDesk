import threading
from django.conf import settings as django_settings
from .models import ActivityLog

# Methods that mutate state — GET, HEAD, OPTIONS are read-only and never logged
WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# URL segments that should never be logged — auth endpoints are handled by SimpleJWT
SKIP_PREFIXES = ["/api/users/token/", "/admin/"]

# Map HTTP method → human-readable action label
METHOD_ACTION_MAP = {
    "POST":   ActivityLog.Action.CREATE,
    "PUT":    ActivityLog.Action.UPDATE,
    "PATCH":  ActivityLog.Action.UPDATE,
    "DELETE": ActivityLog.Action.DELETE,
}


def _get_client_ip(request):
    """Extract real IP.

    Only reads X-Forwarded-For when TRUST_X_FORWARDED_FOR is True (i.e. the
    app is deployed behind a known reverse proxy). Without that setting any
    client can spoof the header and fake their IP in the audit log.
    """
    if django_settings.TRUST_X_FORWARDED_FOR:
        forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _parse_url(path):
    """
    Derive model_name and object_id from the URL path.
    /api/candidates/5/advance/ → ("candidates", "5")
    /api/candidates/           → ("candidates", "")
    /api/                      → ("", "")
    """
    # Strip leading slash and split into segments
    parts = [p for p in path.strip("/").split("/") if p]

    # Expected shape: ["api", "<model>", "<optional-id>", ...]
    model_name = parts[1] if len(parts) > 1 else ""
    object_id  = parts[2] if len(parts) > 2 else ""

    # If the third segment is not numeric it's a custom action name, not an ID
    if object_id and not object_id.isdigit():
        object_id = ""

    return model_name, object_id


class ActivityLogMiddleware:
    """
    Fires after every successful write response and persists an ActivityLog entry.
    Runs synchronously — kept lightweight (one INSERT) so latency impact is minimal.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Let the view handle the request first — we log on the way OUT
        response = self.get_response(request)

        # Only log write methods
        if request.method not in WRITE_METHODS:
            return response

        # Skip auth and admin endpoints — they have their own audit trails
        path = request.path
        if any(path.startswith(prefix) for prefix in SKIP_PREFIXES):
            return response

        # Only log successful responses (2xx range)
        if not (200 <= response.status_code < 300):
            return response

        model_name, object_id = _parse_url(path)
        user = request.user if request.user.is_authenticated else None

        kwargs = dict(
            user        = user,
            action      = METHOD_ACTION_MAP[request.method],
            method      = request.method,
            endpoint    = path,
            model_name  = model_name,
            object_id   = object_id,
            status_code = response.status_code,
            ip_address  = _get_client_ip(request),
        )
        if django_settings.ACTIVITY_LOG_ASYNC:
            # Fire-and-forget so the write response is not held up by the INSERT.
            threading.Thread(target=ActivityLog.objects.create, kwargs=kwargs, daemon=True).start()
        else:
            ActivityLog.objects.create(**kwargs)

        return response
