from django.core.exceptions import ValidationError
from django.db import models

from masterclass.models import Session


class CollisionSystem(models.TextChoices):
    """
    Every collision system a student can submit a J/psi signal for. Mirrors
    `CollisionSystemId` in the student app's `jpsi.models.ts`/`pbpb-minv.models.ts` and the
    teacher app's `jpsi-raa.models.ts` - keep these three in sync.
    """
    PP = 'pp', 'pp'
    PPB = 'pPb', 'p-Pb'
    PBPB_0_5 = 'pbPb_0_5', 'Pb-Pb 0-5%'
    PBPB_5_10 = 'pbPb_5_10', 'Pb-Pb 5-10%'
    PBPB_10_20 = 'pbPb_10_20', 'Pb-Pb 10-20%'
    PBPB_20_30 = 'pbPb_20_30', 'Pb-Pb 20-30%'
    PBPB_30_40 = 'pbPb_30_40', 'Pb-Pb 30-40%'
    PBPB_40_50 = 'pbPb_40_50', 'Pb-Pb 40-50%'
    PBPB_50_70 = 'pbPb_50_70', 'Pb-Pb 50-70%'
    PBPB_70_90 = 'pbPb_70_90', 'Pb-Pb 70-90%'


# Systems for which the student measures nEvents themselves. Pb-Pb nEvents is a fixed,
# published constant kept on the teacher side (`PBPB_NEVENTS` in
# `alice-masterclass-teacher/src/app/jpsi-analysis/jpsi-raa.constants.ts`) - the student has no
# influence over it, so it is never part of this payload.
TRACK_SYSTEMS = (CollisionSystem.PP, CollisionSystem.PPB)


class JpsiAnalysisResult(models.Model):
    """One student's J/psi submission for a session - one row per (session, student), same
    shape as `strangeness.LargeScaleAnalysisResult`. Individual per-system signals live in
    `JpsiAnalysisResultEntry` below."""
    session = models.ForeignKey(Session, on_delete=models.CASCADE)
    student = models.PositiveIntegerField()
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['session', 'student'], name='jar_u_fields'),
        ]


class JpsiAnalysisResultEntry(models.Model):
    """
    One collision system's signal within a student's submission. There is no `massWindow`
    field here on purpose - the student app locks the signal-counting window to a fixed width
    per system (`SIGNAL_WINDOW_WIDTH`/`PBPB_SIGNAL_WINDOW_WIDTH`), matching exactly the window
    the teacher's Acc x epsilon constants are calibrated against, so there is nothing left to
    transmit or correct for on this end.
    """
    result = models.ForeignKey(JpsiAnalysisResult, related_name='entries', on_delete=models.CASCADE)
    system = models.CharField(max_length=16, choices=CollisionSystem.choices)
    signal = models.PositiveIntegerField()
    signalError = models.PositiveIntegerField()
    # Required for pp/p-Pb (TRACK_SYSTEMS), forbidden for Pb-Pb - see clean() below.
    nEvents = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['result', 'system'], name='jare_u_fields'),
        ]

    def clean(self):
        is_track_system = self.system in TRACK_SYSTEMS
        if is_track_system and self.nEvents is None:
            raise ValidationError('nEvents is required for pp/p-Pb entries.')
        if not is_track_system and self.nEvents is not None:
            raise ValidationError('nEvents must not be submitted for Pb-Pb entries (fixed constant on the teacher side).')
