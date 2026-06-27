from rest_framework import serializers
from .models import Candidate, SkillTag



class SkillTagSerializer(serializers.ModelSerializer):
    class Meta:
        model  = SkillTag
        fields = ["id", "name"]

class CandidateSerializer(serializers.ModelSerializer):
    # Read: return full skill objects so the frontend can display names
    skills = SkillTagSerializer(many=True, read_only=True)

    # Write: accept a list of skill name strings — e.g. ["python", "django"]
    skill_names = serializers.ListField(
        child=serializers.CharField(max_length=100),
        write_only=True,
        required=False,
    )

    # Show who created the record without exposing the full user object
    created_by = serializers.StringRelatedField(read_only=True)

    active_submittals_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model  = Candidate
        fields = [
            "id", "first_name", "last_name", "email", "phone",
            "current_title", "current_company", "location", "linkedin_url",
            "status", "source", "notes",
            "gender",
            "years_of_experience",
            "education",
            "current_ctc", "expected_ctc", "notice_period_days",
            "skills", "skill_names",
            "created_by", "created_at", "updated_at",
            "active_submittals_count",
        ]
        read_only_fields = ["created_by", "created_at", "updated_at"]
        # Suppress built-in UniqueValidators so our validate() can return
        # a rich error with the existing candidate's id, name, and status.
        extra_kwargs = {
            "email": {"validators": []},
            "phone": {"validators": []},
        }

    def _sync_skills(self, instance, skill_names):
        # Get-or-create each skill (save() normalizes to lowercase automatically)
        tags = []
        for name in skill_names:
            tag, _ = SkillTag.objects.get_or_create(name=name.strip().lower())
            tags.append(tag)
        instance.skills.set(tags)  # replaces existing skills on update

    def validate_email(self, value):
        return value.lower().strip() if value else value

    def create(self, validated_data):
        skill_names = validated_data.pop("skill_names", [])
        # Inject the requesting user as created_by
        validated_data["created_by"] = self.context["request"].user
        candidate = super().create(validated_data)
        self._sync_skills(candidate, skill_names)
        return candidate

    def update(self, instance, validated_data):
        skill_names = validated_data.pop("skill_names", None)
        candidate = super().update(instance, validated_data)
        # Only update skills if skill_names was explicitly sent in the request
        if skill_names is not None:
            self._sync_skills(candidate, skill_names)
        return candidate