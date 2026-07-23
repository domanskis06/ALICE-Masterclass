from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('strangeness', '0001_initial'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='visualanalysisresultsentry',
            name='vare_u_fields',
        ),
    ]
