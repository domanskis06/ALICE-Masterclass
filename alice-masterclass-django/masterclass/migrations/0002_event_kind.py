from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('masterclass', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='event',
            name='kind',
            field=models.CharField(
                choices=[('strangeness', 'Strangeness'), ('jpsi', 'J/psi'), ('raa', 'R_AA')],
                default='strangeness',
                max_length=16,
            ),
        ),
    ]
