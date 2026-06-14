from django.urls import path
from .views import SearchView

urlpatterns = [
    # GET /api/search/?q=<term>
    # GET /api/search/?q=<term>&type=candidates|jobs|clients
    path("search/", SearchView.as_view(), name="search"),
]