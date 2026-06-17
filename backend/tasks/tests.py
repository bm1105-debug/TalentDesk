import datetime

from django.core.management import call_command
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from users.models import User, Role
from candidates.models import Candidate
from jobs.models import Job
from clients.models import Client
from notifications.models import Notification
from .models import Task


def make_user(email, role=Role.RECRUITER, password="pass1234"):
    return User.objects.create_user(
        username=email.split("@")[0], password=password,
        email=email, first_name="Test", last_name="User", role=role,
    )


def auth(client, user):
    url = reverse("token_obtain")
    res = client.post(url, {"username": user.username, "password": "pass1234"}, format="json")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")


def make_task(assignee, **kwargs):
    defaults = {"title": "Follow up", "assignee": assignee, "created_by": assignee}
    defaults.update(kwargs)
    return Task.objects.create(**defaults)


class TaskCRUDTests(APITestCase):
    def setUp(self):
        self.recruiter = make_user("recruiter@tasks.com")
        auth(self.client, self.recruiter)

    def test_create_task_defaults_assignee_to_self(self):
        res = self.client.post(reverse("task-list"), {"title": "Call Alice"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["assignee"], self.recruiter.id)

    def test_create_task_with_due_date(self):
        res = self.client.post(reverse("task-list"), {
            "title": "Send CV", "due_date": "2030-01-01",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["due_date"], "2030-01-01")

    def test_list_tasks_returns_own_only(self):
        other = make_user("other@tasks.com")
        make_task(self.recruiter, title="Mine")
        make_task(other, title="Not mine")
        res = self.client.get(reverse("task-list"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        titles = [t["title"] for t in res.data["results"]]
        self.assertIn("Mine", titles)
        self.assertNotIn("Not mine", titles)

    def test_patch_task_done(self):
        task = make_task(self.recruiter)
        res = self.client.patch(
            reverse("task-detail", args=[task.id]),
            {"status": "done"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "done")

    def test_reopen_task_clears_notified_at(self):
        from datetime import date
        task = make_task(self.recruiter, status="done", notified_at=date.today())
        res = self.client.patch(
            reverse("task-detail", args=[task.id]),
            {"status": "open"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        task.refresh_from_db()
        self.assertIsNone(task.notified_at)

    def test_delete_own_task(self):
        task = make_task(self.recruiter)
        res = self.client.delete(reverse("task-detail", args=[task.id]))
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

    def test_create_task_requires_auth(self):
        self.client.credentials()
        res = self.client.post(reverse("task-list"), {"title": "x"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class TaskPermissionTests(APITestCase):
    def setUp(self):
        self.recruiter_a = make_user("recA@tasks.com")
        self.recruiter_b = make_user("recB@tasks.com")
        self.manager     = make_user("mgr@tasks.com", role=Role.ACCOUNT_MANAGER)
        self.task_a      = make_task(self.recruiter_a, title="A's task")

    def test_recruiter_cannot_read_other_recruiter_task(self):
        auth(self.client, self.recruiter_b)
        res = self.client.get(reverse("task-list"))
        ids = [t["id"] for t in res.data["results"]]
        self.assertNotIn(self.task_a.id, ids)

    def test_manager_can_read_all_tasks(self):
        auth(self.client, self.manager)
        res = self.client.get(reverse("task-list"))
        ids = [t["id"] for t in res.data["results"]]
        self.assertIn(self.task_a.id, ids)

    def test_recruiter_cannot_delete_other_recruiter_task(self):
        auth(self.client, self.recruiter_b)
        res = self.client.delete(reverse("task-detail", args=[self.task_a.id]))
        self.assertIn(res.status_code, [403, 404])

    def test_manager_can_delete_any_task(self):
        auth(self.client, self.manager)
        res = self.client.delete(reverse("task-detail", args=[self.task_a.id]))
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)


class TaskFilterTests(APITestCase):
    def setUp(self):
        self.recruiter = make_user("filter@tasks.com")
        auth(self.client, self.recruiter)
        self.client_obj = Client.objects.create(name="Acme")
        self.job = Job.objects.create(
            title="Dev", client=self.client_obj, created_by=self.recruiter
        )
        self.candidate = Candidate.objects.create(
            first_name="Alice", last_name="Smith",
            email="alice@filter.com", phone="9900",
        )

    def test_status_filter_open(self):
        make_task(self.recruiter, title="Open", status="open")
        make_task(self.recruiter, title="Done", status="done")
        res = self.client.get(reverse("task-list"), {"status": "open"})
        statuses = [t["status"] for t in res.data["results"]]
        self.assertTrue(all(s == "open" for s in statuses))

    def test_candidate_filter(self):
        t1 = make_task(self.recruiter, title="With candidate", related_candidate=self.candidate)
        make_task(self.recruiter, title="Without candidate")
        res = self.client.get(reverse("task-list"), {"candidate": self.candidate.id})
        ids = [t["id"] for t in res.data["results"]]
        self.assertIn(t1.id, ids)
        self.assertEqual(len(ids), 1)

    def test_job_filter(self):
        t1 = make_task(self.recruiter, title="With job", related_job=self.job)
        make_task(self.recruiter, title="Without job")
        res = self.client.get(reverse("task-list"), {"job": self.job.id})
        ids = [t["id"] for t in res.data["results"]]
        self.assertIn(t1.id, ids)
        self.assertEqual(len(ids), 1)


class NotifyDueTasksTests(APITestCase):
    def setUp(self):
        self.recruiter = make_user("notifydue@tasks.com")
        self.today = timezone.localdate()

    def test_due_today_task_receives_notification(self):
        make_task(self.recruiter, title="Due today", due_date=self.today)
        call_command("notify_due_tasks", verbosity=0)
        notif_count = Notification.objects.filter(recipient=self.recruiter).count()
        self.assertEqual(notif_count, 1)

    def test_command_is_idempotent(self):
        # Running twice must not send a second notification
        make_task(self.recruiter, title="Due today", due_date=self.today)
        call_command("notify_due_tasks", verbosity=0)
        call_command("notify_due_tasks", verbosity=0)
        notif_count = Notification.objects.filter(recipient=self.recruiter).count()
        self.assertEqual(notif_count, 1)

    def test_done_task_not_notified(self):
        make_task(self.recruiter, title="Done today", due_date=self.today, status="done")
        call_command("notify_due_tasks", verbosity=0)
        notif_count = Notification.objects.filter(recipient=self.recruiter).count()
        self.assertEqual(notif_count, 0)

    def test_future_task_not_notified(self):
        tomorrow = self.today + datetime.timedelta(days=1)
        make_task(self.recruiter, title="Due tomorrow", due_date=tomorrow)
        call_command("notify_due_tasks", verbosity=0)
        notif_count = Notification.objects.filter(recipient=self.recruiter).count()
        self.assertEqual(notif_count, 0)

    def test_notified_at_set_after_command(self):
        task = make_task(self.recruiter, title="Due today", due_date=self.today)
        call_command("notify_due_tasks", verbosity=0)
        task.refresh_from_db()
        self.assertEqual(task.notified_at, self.today)
