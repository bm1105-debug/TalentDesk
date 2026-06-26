'''
Maps URL paths to the views. 
Also wires up SimpleJWT's built-in token endpoints — login (/token/) 
and refresh (/token/refresh/) come for free from the library.

'''

from django.urls import path
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView, TokenBlacklistView

from users.views import (
    RegisterView,
    MeView,
    ChangePasswordView,
    UserListView,
    UserDetailView,
    AdminPasswordResetView,
)


class LoginRateThrottle(AnonRateThrottle):
    scope = "login"

    def get_rate(self):
        from rest_framework.settings import api_settings
        return api_settings.DEFAULT_THROTTLE_RATES.get(self.scope, "5/minute")


class ThrottledTokenObtainPairView(TokenObtainPairView):
    throttle_classes = [LoginRateThrottle]

urlpatterns = [
    # --- Auth ---
    # POST: {"username": "...", "password": "..."} → returns access + refresh tokens
    path("token/", ThrottledTokenObtainPairView.as_view(), name="token_obtain"),

    # POST: {"refresh": "..."} → returns a new access token
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),

    # POST: {"refresh": "..."} → blacklists the token (call on logout)
    path("token/blacklist/", TokenBlacklistView.as_view(), name="token_blacklist"),

    # --- User management ---
    # POST: CEO creates a new staff user
    path("register/", RegisterView.as_view(), name="user_register"),

    # GET: returns the profile of whoever is logged in (from JWT)
    path("me/", MeView.as_view(), name="user_me"),

    # POST: change own password — any authenticated user
    path("change-password/", ChangePasswordView.as_view(), name="change_password"),

    # GET: list all users — CEO and Account Manager only
    path("", UserListView.as_view(), name="user_list"),

    # GET/PATCH: retrieve or update a single user — CEO only
    path("<int:pk>/", UserDetailView.as_view(), name="user_detail"),

    # POST: VP/CEO resets a user's password and returns a temp password
    path("<int:pk>/reset-password/", AdminPasswordResetView.as_view(), name="user_reset_password"),
]

