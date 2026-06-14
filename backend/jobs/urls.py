from rest_framework.routers import DefaultRouter
from .views import JobViewSet

router = DefaultRouter()

# /api/jobs/                        — list, create
# /api/jobs/{id}/                   — retrieve, update, destroy
# /api/jobs/{id}/reorder-stages/    — custom action
# /api/jobs/{id}/assign/            — custom action
# /api/jobs/{id}/unassign/          — custom action
router.register(r"jobs", JobViewSet, basename="job")

urlpatterns = router.urls