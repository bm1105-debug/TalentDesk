from django.urls import path
from .views import (
    AttachmentListCreateView,
    AttachmentDestroyView,
    AttachmentDownloadView,
    ResumeParseView,
)

urlpatterns = [
    path("attachments/parse/",             ResumeParseView.as_view(),          name="attachment-parse"),
    path("attachments/",                   AttachmentListCreateView.as_view(), name="attachment-list"),
    path("attachments/<int:pk>/",          AttachmentDestroyView.as_view(),    name="attachment-delete"),
    path("attachments/<int:pk>/download/", AttachmentDownloadView.as_view(),   name="attachment-download"),
]
