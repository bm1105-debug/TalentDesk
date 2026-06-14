from rest_framework.routers import DefaultRouter
from .views import CandidateViewSet, SkillTagViewSet

router = DefaultRouter()

# /api/candidates/           — list, create
# /api/candidates/{id}/      — retrieve, update, destroy
# /api/candidates/{id}/add-skill/     — custom action
# /api/candidates/{id}/remove-skill/  — custom action
router.register(r"candidates", CandidateViewSet, basename="candidate")

# /api/skills/       — list, retrieve (read-only)
# /api/skills/?search=py  — search by name (autocomplete)
router.register(r"skills", SkillTagViewSet, basename="skill")

urlpatterns = router.urls