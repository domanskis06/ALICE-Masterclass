from django.db import models

from masterclass.models import Session

class Particle(models.TextChoices):
    K0 = 'k0', 'Kaon'
    LAMBDA = 'lambda', 'Lambda'
    ANTILAMBDA = 'antilambda', 'Anti-Lambda'
    XI = 'xi', 'xi'
    ANTIXI = 'antixi', 'Anti-Xi'

class Collision(models.TextChoices):
    PP = 'pp', 'pp'
    PBPB = 'pbpb', 'Pb-Pb'

class Centrality(models.TextChoices):
    c000_000 = '000_000', '0%'
    c000_010 = '000_010', '0% - 10%'
    c010_020 = '010_020', '10% - 20%'
    c020_030 = '020_030', '20% - 30%'
    c030_040 = '030_040', '30% - 40%'
    c040_050 = '040_050', '40% - 50%'
    c050_060 = '050_060', '50% - 60%'
    c060_070 = '060_070', '60% - 70%'
    c070_080 = '070_080', '70% - 80%'
    c080_090 = '080_090', '80% - 90%'
    c090_100 = '090_100', '90% - 100%'

class VisualAnalysisResult(models.Model):
    session = models.ForeignKey(Session, on_delete=models.CASCADE)
    student = models.PositiveIntegerField()
    dataset = models.IntegerField()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['session', 'student', 'dataset'], name='var_u_fields')
        ]

class VisualAnalysisResultsEntry(models.Model):
    result = models.ForeignKey(VisualAnalysisResult, on_delete=models.CASCADE)
    eventid = models.PositiveIntegerField()
    particle = models.CharField(max_length=16, choices=Particle.choices)
    mass = models.FloatField()
    # Multiple mother particles per event are allowed (multi-V0 events).

class LargeScaleAnalysisResult(models.Model):
    session = models.ForeignKey(Session, on_delete=models.CASCADE)
    student = models.PositiveIntegerField()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['session', 'student'], name='lsar_u_fields')
        ]

class LargeScaleAnalysisResultsEntry(models.Model):
    result = models.ForeignKey(LargeScaleAnalysisResult, on_delete=models.CASCADE)
    particle = models.CharField(max_length=16, choices=Particle.choices)
    collision = models.CharField(max_length=4, choices=Collision.choices)
    centrality = models.CharField(max_length=7, choices=Centrality.choices)
    signal = models.PositiveIntegerField()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['result', 'particle', 'collision', 'centrality'], name='lsare_u_fields')
        ]
