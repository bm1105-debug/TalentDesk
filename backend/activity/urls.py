from rest_framework.routers import DefaultRouter
from .views import ActivityLogViewSet

router = DefaultRouter()

# /api/activity/             — list (managers only)
# /api/activity/{id}/        — retrieve single entry
# Query params: ?model=candidates  ?action=delete  ?user=3  ?search=jane
router.register(r"activity", ActivityLogViewSet, basename="activity")

urlpatterns = router.urls