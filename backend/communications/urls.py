'''
Wires up the three communication endpoints — 
template CRUD via router, and the two action views (send and preview) 
as direct path() entries since they're APIView not ViewSet.

'''

from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import EmailTemplateViewSet, SendEmailView, PreviewEmailView, SentEmailViewSet

router = DefaultRouter()

# /api/communications/templates/          — list, create (manager)
# /api/communications/templates/{id}/     — retrieve, update, delete
router.register(r"communications/templates", EmailTemplateViewSet, basename="emailtemplate")

# /api/communications/sent/               — audit log list (manager)
# /api/communications/sent/{id}/          — single sent email detail
router.register(r"communications/sent", SentEmailViewSet, basename="sentemail")

urlpatterns = router.urls + [
    # POST /api/communications/send/      — render template + send + log
    path("communications/send/",    SendEmailView.as_view(),    name="communications-send"),

    # POST /api/communications/preview/   — render template, return without sending
    path("communications/preview/", PreviewEmailView.as_view(), name="communications-preview"),
]