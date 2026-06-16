# offers/urls.py

from rest_framework.routers import DefaultRouter
from .views import OfferViewSet

router = DefaultRouter()
router.register(r"offers", OfferViewSet, basename="offer")

urlpatterns = router.urls
