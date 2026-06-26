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
        fields = (
            "id", "username", "email", "first_name", "last_name",
            "role", "phone", "reports_to", "password", "password2",
        )
        extra_kwargs = {
            "first_name":  {"required": True},
            "last_name":   {"required": True},
            "email":       {"required": True},
            "reports_to":  {"required": False},
        }

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_reports_to(self, value):
        if value and value.role != 'team_lead':
            raise serializers.ValidationError("reports_to must be a Team Lead.")
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("password2"):
            raise serializers.ValidationError({"password": "Passwords do not match."})
        return attrs

    def create(self, validated_data):
        # set_password hashes the password — never store plain text
        user = User.objects.create_user(**validated_data)
        return user

class UserSerializer(serializers.ModelSerializer):
    role_display    = serializers.CharField(source="get_role_display", read_only=True)
    reports_to_name = serializers.SerializerMethodField()

    def get_reports_to_name(self, obj):
        if obj.reports_to_id:
            tl = obj.reports_to
            return f"{tl.first_name} {tl.last_name}".strip() or tl.username
        return None

    class Meta:
        model = User
        fields = (
            "id", "username", "email", "first_name", "last_name",
            "role", "role_display", "phone", "is_active", "date_joined",
            "last_login", "reports_to", "reports_to_name",
        )
        read_only_fields = fields

class MeUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("first_name", "last_name", "email", "phone")

    def validate_email(self, value):
        if User.objects.filter(email=value).exclude(pk=self.instance.pk).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value


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