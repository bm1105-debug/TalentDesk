from django.test import TestCase
from unittest.mock import MagicMock, PropertyMock, patch
from users.mixins import RoleQuerysetMixin
from users.models import User, Role


class RoleQuerysetMixinTests(TestCase):
    """Unit tests for RoleQuerysetMixin.allowed_author_ids()."""

    def _mixin_for(self, user):
        mixin = RoleQuerysetMixin()
        mixin.request = MagicMock()
        mixin.request.user = user
        return mixin

    def setUp(self):
        self.team_lead = User.objects.create_user(
            username="tl", password="x", role=Role.TEAM_LEAD,
            first_name="Tom", last_name="Lead", email="tl@t.com",
        )
        self.rec1 = User.objects.create_user(
            username="rec1", password="x", role=Role.RECRUITER,
            first_name="R1", last_name="Rec", email="r1@t.com",
            reports_to=self.team_lead,
        )
        self.rec2 = User.objects.create_user(
            username="rec2", password="x", role=Role.RECRUITER,
            first_name="R2", last_name="Rec", email="r2@t.com",
            reports_to=self.team_lead,
        )
        self.rec_other = User.objects.create_user(
            username="rec_other", password="x", role=Role.RECRUITER,
            first_name="Other", last_name="Rec", email="other@t.com",
        )
        self.am = User.objects.create_user(
            username="am", password="x", role=Role.ACCOUNT_MANAGER,
            first_name="Alice", last_name="Manager", email="am@t.com",
        )
        self.ceo = User.objects.create_user(
            username="ceo", password="x", role=Role.CEO,
            first_name="Big", last_name="Boss", email="ceo@t.com",
        )

    def test_recruiter_sees_only_self(self):
        ids = self._mixin_for(self.rec1).allowed_author_ids()
        self.assertEqual(ids, {self.rec1.pk})

    def test_recruiter_does_not_see_pod_mate(self):
        ids = self._mixin_for(self.rec1).allowed_author_ids()
        self.assertNotIn(self.rec2.pk, ids)

    def test_team_lead_sees_self_and_pod(self):
        ids = self._mixin_for(self.team_lead).allowed_author_ids()
        self.assertIn(self.team_lead.pk, ids)
        self.assertIn(self.rec1.pk, ids)
        self.assertIn(self.rec2.pk, ids)

    def test_team_lead_does_not_see_outside_pod(self):
        ids = self._mixin_for(self.team_lead).allowed_author_ids()
        self.assertNotIn(self.rec_other.pk, ids)

    def test_account_manager_returns_none(self):
        self.assertIsNone(self._mixin_for(self.am).allowed_author_ids())

    def test_ceo_returns_none(self):
        self.assertIsNone(self._mixin_for(self.ceo).allowed_author_ids())

    def test_is_manager_true_for_am(self):
        self.assertTrue(self._mixin_for(self.am).is_manager())

    def test_is_manager_true_for_ceo(self):
        self.assertTrue(self._mixin_for(self.ceo).is_manager())

    def test_is_manager_false_for_team_lead(self):
        self.assertFalse(self._mixin_for(self.team_lead).is_manager())

    def test_is_manager_false_for_recruiter(self):
        self.assertFalse(self._mixin_for(self.rec1).is_manager())
