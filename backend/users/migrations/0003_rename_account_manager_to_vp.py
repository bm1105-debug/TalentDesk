from django.db import migrations, models


def forwards(apps, schema_editor):
    User = apps.get_model('users', 'User')
    User.objects.filter(role='account_manager').update(role='vp')


def backwards(apps, schema_editor):
    User = apps.get_model('users', 'User')
    User.objects.filter(role='vp').update(role='account_manager')


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0002_add_reports_to_user'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='role',
            field=models.CharField(
                choices=[
                    ('recruiter', 'Recruiter'),
                    ('team_lead', 'Team Lead'),
                    ('vp', 'VP'),
                    ('ceo', 'CEO / Admin'),
                ],
                db_index=True,
                default='recruiter',
                max_length=20,
            ),
        ),
        migrations.RunPython(forwards, backwards),
    ]
