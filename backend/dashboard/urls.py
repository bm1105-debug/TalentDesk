from django.urls import path
from .views import (
    MyDayView, AnalyticsView, ScorecardView, UserAnalyticsView,
    ConversionFunnelView, TimeToFillTrendView, DeclineReasonsView, DiversityView,
)


urlpatterns = [
    path("dashboard/my-day/",                       MyDayView.as_view(),           name="dashboard-my-day"),
    path("dashboard/analytics/",                    AnalyticsView.as_view(),       name="dashboard-analytics"),
    path("dashboard/analytics/user/<int:user_id>/", UserAnalyticsView.as_view(),   name="dashboard-user-analytics"),
    path("dashboard/scorecard/",                    ScorecardView.as_view(),       name="dashboard-scorecard"),
    path("dashboard/conversion-funnel/",            ConversionFunnelView.as_view(), name="dashboard-conversion-funnel"),
    path("dashboard/time-to-fill-trend/",           TimeToFillTrendView.as_view(), name="dashboard-time-to-fill-trend"),
    path("dashboard/decline-reasons/",              DeclineReasonsView.as_view(),  name="dashboard-decline-reasons"),
    path("dashboard/diversity/",                    DiversityView.as_view(),       name="dashboard-diversity"),
]
