'''
Three serializers:
- ContactSerializer — read/write for individual contacts
- ClientSerializer — full client detail including nested contacts (read) and account manager name
- ClientWriteSerializer — used on create/update, accepts account_manager as an ID (not nested)

'''

from rest_framework import serializers
from clients.models import Client, Contact
from users.models import User

class ContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contact
        fields = (
            "id", "client", "first_name", "last_name",
            "title", "email", "phone", "is_primary", "created_at",
        )
        # client is always set from the URL parameter, never from the request body
        read_only_fields = ("id", "client", "created_at")

class ClientSerializer(serializers.ModelSerializer):
    # Nested contacts are read-only — managed via /contacts/ endpoints
    contacts = ContactSerializer(many=True, read_only=True)

    # Human-readable account manager name shown in list/detail views
    account_manager_name = serializers.SerializerMethodField()

    class Meta:
        model = Client
        fields = (
            "id", "name", "industry", "website", "location",
            "status", "account_manager", "account_manager_name",
            "notes", "contacts", "created_by", "created_at", "updated_at",
        )
        read_only_fields = ("id", "created_by", "created_at", "updated_at")

    def get_account_manager_name(self, obj):
        # Returns full name of the account manager, or None if unassigned
        if obj.account_manager:
            return f"{obj.account_manager.first_name} {obj.account_manager.last_name}"
        return None

class ClientWriteSerializer(serializers.ModelSerializer):
    # On writes, account_manager is a plain FK integer — no nesting
    account_manager = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role__in=["account_manager", "ceo"]),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Client
        fields = (
            "id", "name", "industry", "website", "location",
            "status", "account_manager", "notes",
        )
        read_only_fields = ("id",)

    def create(self, validated_data):
        # Stamp the creating user — pulled from request context
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)