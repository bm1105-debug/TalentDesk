# What this file does: registers all interview endpoints with the DRF router.

from rest_framework.routers import DefaultRouter
from .views import InterviewViewSet

router = DefaultRouter()

# /api/interviews/                        — list, create
# /api/interviews/{id}/                   — retrieve, patch, delete
# /api/interviews/{id}/update-status/     — mark completed/cancelled/no-show
# Query params: ?submittal=5  ?status=scheduled  ?type=video
router.register(r"interviews", InterviewViewSet, basename="interview")

urlpatterns = router.urls