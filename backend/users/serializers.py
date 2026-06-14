'''
Handles converting User model data to/from JSON for the API. Three serializers:
- RegisterSerializer — creates a new user (validates password, hashes it before saving)
- UserSerializer — read-only profile data returned after login or on /me/
- ChangePasswordSerializer — validates old password before allowing a change
'''

from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from users.models import User

class RegisterSerializer(serializers.ModelSerializer):
    # write_only=True ensures password never appears in any response
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "last_name", "role", "phone", "password", "password2")
        # role is settable only by CEO — enforced in the view, not here
        extra_kwargs = {
            "first_name": {"required": True},
            "last_name": {"required": True},
            "email": {"required": True},
        }

    def validate(self, attrs):
        # Confirm both password fields match before touching the DB
        if attrs["password"] != attrs.pop("password2"):
            raise serializers.ValidationError({"password": "Passwords do not match."})
        return attrs

    def create(self, validated_data):
        # set_password hashes the password — never store plain text
        user = User.objects.create_user(**validated_data)
        return user

class UserSerializer(serializers.ModelSerializer):
    # role_display gives the human-readable label e.g. "Account Manager"
    role_display = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = User
        fields = (
            "id", "username", "email", "first_name", "last_name",
            "role", "role_display", "phone", "is_active", "date_joined",
        )
        # All fields are read-only here — updates go through a dedicated endpoint
        read_only_fields = fields

class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, validators=[validate_password])
    new_password2 = serializers.CharField(write_only=True)

    def validate_old_password(self, value):
        # request is passed via context={"request": request} in the view
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Old password is incorrect.")
        return value

    def validate(self, attrs):
        # Cross-field validation: both new password fields must match
        if attrs["new_password"] != attrs["new_password2"]:
            raise serializers.ValidationError({"new_password": "Passwords do not match."})
        return attrs

    def save(self):
        # Called after validate() passes — hashes and saves the new password
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])
        return user