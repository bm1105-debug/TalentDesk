# maps the two CV-export endpoints to their views.

from django.urls import path
from .views import CandidatePDFView, CandidateDOCXView

urlpatterns = [
    # PDF download: renders cv.html via xhtml2pdf
    path("cvgen/candidates/<int:pk>/pdf/",  CandidatePDFView.as_view(),  name="candidate-cv-pdf"),

    # DOCX download: builds a Word doc via python-docx
    path("cvgen/candidates/<int:pk>/docx/", CandidateDOCXView.as_view(), name="candidate-cv-docx"),
]