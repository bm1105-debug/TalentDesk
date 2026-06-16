from .models import Notification


def notify(recipient, message, candidate=None):
    """Create a notification for a user. Safe to call from any view."""
    if recipient is None:
        return
    Notification.objects.create(
        recipient=recipient,
        message=message,
        candidate=candidate,
    )
