from rest_framework.routers import DefaultRouter
from .views import SubmittalViewSet

router = DefaultRouter()

# /api/submittals/                          — list, create
# /api/submittals/{id}/                     — retrieve, patch, delete
# /api/submittals/{id}/advance/             — move to next pipeline stage
# /api/submittals/{id}/add-note/            — append a note to the event log
# /api/submittals/{id}/change-status/       — manager closes or places a submittal
# Query params: ?job=3  ?candidate=7  ?status=active
router.register(r"submittals", SubmittalViewSet, basename="submittal")

urlpatterns = router.urls