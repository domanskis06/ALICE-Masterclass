from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('masterclass', '0002_event_kind'),
    ]

    operations = [
        migrations.CreateModel(
            name='JpsiAnalysisResult',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('student', models.PositiveIntegerField()),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('session', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='masterclass.session')),
            ],
        ),
        migrations.CreateModel(
            name='JpsiAnalysisResultEntry',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('system', models.CharField(choices=[
                    ('pp', 'pp'),
                    ('pPb', 'p-Pb'),
                    ('pbPb_0_5', 'Pb-Pb 0-5%'),
                    ('pbPb_5_10', 'Pb-Pb 5-10%'),
                    ('pbPb_10_20', 'Pb-Pb 10-20%'),
                    ('pbPb_20_30', 'Pb-Pb 20-30%'),
                    ('pbPb_30_40', 'Pb-Pb 30-40%'),
                    ('pbPb_40_50', 'Pb-Pb 40-50%'),
                    ('pbPb_50_70', 'Pb-Pb 50-70%'),
                    ('pbPb_70_90', 'Pb-Pb 70-90%'),
                ], max_length=16)),
                ('signal', models.PositiveIntegerField()),
                ('signalError', models.PositiveIntegerField()),
                ('nEvents', models.PositiveIntegerField(blank=True, null=True)),
                ('result', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='entries', to='jpsi.jpsianalysisresult')),
            ],
        ),
        migrations.AddConstraint(
            model_name='jpsianalysisresult',
            constraint=models.UniqueConstraint(fields=('session', 'student'), name='jar_u_fields'),
        ),
        migrations.AddConstraint(
            model_name='jpsianalysisresultentry',
            constraint=models.UniqueConstraint(fields=('result', 'system'), name='jare_u_fields'),
        ),
    ]
