from django.urls import path
from .views import MyDayView


urlpatterns = [
    # GET /api/dashboard/my-day/ — personalised action queue for the logged-in user
    path("dashboard/my-day/", MyDayView.as_view(), name="dashboard-my-day"),
]