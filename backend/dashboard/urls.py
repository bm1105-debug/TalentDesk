from django.urls import path
from .views import MyDayView, AnalyticsView


urlpatterns = [
    path("dashboard/my-day/",    MyDayView.as_view(),     name="dashboard-my-day"),
    path("dashboard/analytics/", AnalyticsView.as_view(), name="dashboard-analytics"),
]