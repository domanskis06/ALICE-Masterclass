# Generated manually for Anti-Xi particle choice

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('strangeness', '0002_remove_vare_u_fields'),
    ]

    operations = [
        migrations.AlterField(
            model_name='largescaleanalysisresultsentry',
            name='particle',
            field=models.CharField(
                choices=[
                    ('k0', 'Kaon'),
                    ('lambda', 'Lambda'),
                    ('antilambda', 'Anti-Lambda'),
                    ('xi', 'xi'),
                    ('antixi', 'Anti-Xi'),
                ],
                max_length=16,
            ),
        ),
        migrations.AlterField(
            model_name='visualanalysisresultsentry',
            name='particle',
            field=models.CharField(
                choices=[
                    ('k0', 'Kaon'),
                    ('lambda', 'Lambda'),
                    ('antilambda', 'Anti-Lambda'),
                    ('xi', 'xi'),
                    ('antixi', 'Anti-Xi'),
                ],
                max_length=16,
            ),
        ),
    ]
