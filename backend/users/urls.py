'''
Maps URL paths to the views. 
Also wires up SimpleJWT's built-in token endpoints — login (/token/) 
and refresh (/token/refresh/) come for free from the library.

'''

from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from users.views import (
    RegisterView,
    MeView,
    ChangePasswordView,
    UserListView,
    UserDetailView,
)

urlpatterns = [
    # --- Auth ---
    # POST: {"username": "...", "password": "..."} → returns access + refresh tokens
    path("token/", TokenObtainPairView.as_view(), name="token_obtain"),

    # POST: {"refresh": "..."} → returns a new access token
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),

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
]

