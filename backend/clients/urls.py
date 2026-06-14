'''
 Uses a nested router so contacts live under their 
 client's URL (/api/clients/<id>/contacts/). 
 This requires drf-nested-routers
'''


from rest_framework_nested import routers
from clients.views import ClientViewSet, ContactViewSet

# Parent router: /api/clients/
router = routers.SimpleRouter()
router.register(r"", ClientViewSet, basename="client")

# Nested router: /api/clients/<client_pk>/contacts/
contacts_router = routers.NestedSimpleRouter(router, r"", lookup="client")
contacts_router.register(r"contacts", ContactViewSet, basename="client-contacts")

urlpatterns = router.urls + contacts_router.urls