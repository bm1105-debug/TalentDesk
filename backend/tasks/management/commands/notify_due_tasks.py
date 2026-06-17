from django.core.management.base import BaseCommand
from django.utils import timezone

from notifications.utils import notify
from tasks.models import Task


class Command(BaseCommand):
    help = "Send in-app notifications for tasks due today. Idempotent — safe to run multiple times."

    def handle(self, *args, **options):
        today = timezone.localdate()

        due_tasks = Task.objects.filter(
            due_date=today,
            status=Task.Status.OPEN,
            notified_at__isnull=True,
        ).select_related("assignee")

        count = 0
        for task in due_tasks:
            notify(
                recipient=task.assignee,
                message=f"Task due today: {task.title}",
            )
            task.notified_at = today
            task.save(update_fields=["notified_at"])
            count += 1

        self.stdout.write(self.style.SUCCESS(f"Notified {count} task(s) due today."))
