from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    # Django admin — useful for superuser management
    path("admin/", admin.site.urls),

    # All user and auth endpoints live under /api/users/
    path("api/users/", include("users.urls")),

    # Client and contact endpoints live under /api/clients/
    path("api/clients/", include("clients.urls")),

    path("api/", include("candidates.urls")),

    path("api/", include("jobs.urls")),

    path("api/", include("submittals.urls")),

    path("api/", include("activity.urls")),

    path("api/", include("dashboard.urls")),

    path("api/", include("search.urls")),

    path("api/", include("interviews.urls")),

    path("api/", include("communications.urls")),

    path("api/", include("cvgen.urls")),
    path("api/", include("attachments.urls")),
    path("api/", include("notifications.urls")),
    path("api/", include("offers.urls")),
]

# Serve uploaded files (resumes, docs) in development only
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)