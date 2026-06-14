'''
Two ViewSets — ClientViewSet for CRUD on clients, 
ContactViewSet for CRUD on contacts nested under a client. 
Row-level scoping: recruiters see all clients (they need to know who the firm works with) but only Account Managers and above can create or modify

'''

from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from clients.models import Client, Contact
from clients.serializers import ClientSerializer, ClientWriteSerializer, ContactSerializer
from users.permissions import IsAccountManagerOrAbove, IsRecruiterOrAbove

class ClientViewSet(viewsets.ModelViewSet):
    """
    GET    /api/clients/          — list all clients (any staff)
    POST   /api/clients/          — create client (Account Manager and above)
    GET    /api/clients/<id>/     — retrieve client with contacts (any staff)
    PATCH  /api/clients/<id>/     — update client (Account Manager and above)
    DELETE /api/clients/<id>/     — delete client (Account Manager and above)
    """

    def get_permissions(self):
        # Read actions are open to all staff; writes are restricted
        if self.action in ("list", "retrieve"):
            return [IsRecruiterOrAbove()]
        return [IsAccountManagerOrAbove()]

    def get_queryset(self):
        # Prefetch contacts to avoid N+1 on list view
        # select_related account_manager to avoid N+1 on name display
        return Client.objects.select_related(
            "account_manager", "created_by"
        ).prefetch_related("contacts").order_by("name")

    def get_serializer_class(self):
        # Use the write serializer on create/update, read serializer otherwise
        if self.action in ("create", "update", "partial_update"):
            return ClientWriteSerializer
        return ClientSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        client = serializer.save()
        # Return full read representation after creation
        return Response(
            ClientSerializer(client, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(
            instance, data=request.data, partial=partial,
            context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        client = serializer.save()
        return Response(ClientSerializer(client, context={"request": request}).data)

class ContactViewSet(viewsets.ModelViewSet):
    """
    GET    /api/clients/<client_id>/contacts/         — list contacts for a client
    POST   /api/clients/<client_id>/contacts/         — add a contact
    GET    /api/clients/<client_id>/contacts/<id>/    — retrieve a contact
    PATCH  /api/clients/<client_id>/contacts/<id>/    — update a contact
    DELETE /api/clients/<client_id>/contacts/<id>/    — remove a contact
    """
    serializer_class = ContactSerializer

    def get_permissions(self):
        # Same rule: reads for all staff, writes for account managers and above
        if self.action in ("list", "retrieve"):
            return [IsRecruiterOrAbove()]
        return [IsAccountManagerOrAbove()]

    def get_queryset(self):
        # Scope contacts to the client in the URL — never leak other clients' contacts
        return Contact.objects.filter(
            client_id=self.kwargs["client_pk"]
        ).select_related("client")

    def perform_create(self, serializer):
        # Bind the contact to the client from the URL automatically
        client = Client.objects.get(pk=self.kwargs["client_pk"])
        serializer.save(client=client)

