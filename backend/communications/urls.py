from django.urls import path
from .views import GenerateEmailView, EmailHistoryView

urlpatterns = [
    path("communications/ai-generate/", GenerateEmailView.as_view(), name="ai-generate-email"),
    path("communications/ai-history/",  EmailHistoryView.as_view(),  name="ai-email-history"),
]
