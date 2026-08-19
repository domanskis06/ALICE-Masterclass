from django.db import models

from masterclass.models import Session


class EventClass(models.TextChoices):
    """
    Event roles of the Nuclear Modification "Event Exploration" (part 1) data
    sets — the same keys the student app uses (`RaaEventRole`), which in turn
    mirror the desktop ROOT app's `Raa::EventDisplay::NewEvent` mapping:
    event 0 is a 7 TeV pp event without field, events 1..30 are pp at 2.76 TeV,
    and events 31/32/33 are the peripheral/semi-central/central Pb-Pb events.
    """
    PP_7TEV = 'pp7TeV', 'pp 7 TeV (no field)'
    PP_276TEV = 'pp276TeV', 'pp 2.76 TeV'
    PBPB_PERIPHERAL = 'pbPbPeripheral', 'Pb-Pb peripheral'
    PBPB_SEMI_CENTRAL = 'pbPbSemiCentral', 'Pb-Pb semi-central'
    PBPB_CENTRAL = 'pbPbCentral', 'Pb-Pb central'


#: The three Pb-Pb classes an R_AA value is reported for. Matches the desktop
#: `Raa::StudentValue` triplet (Peripheral / Semi-central / Central).
PBPB_CLASSES = (
    EventClass.PBPB_PERIPHERAL,
    EventClass.PBPB_SEMI_CENTRAL,
    EventClass.PBPB_CENTRAL,
)


class EventExplorationResult(models.Model):
    """
    One student's part-1 submission for a session.

    The desktop instructor tool (`Raa/instructors/Collect.h`) collects exactly
    one `StudentValue` per student, so the row is keyed by session + student and
    a re-submission replaces the previous one. `dataset` is informational: which
    of the interchangeable 34-event data sets the student worked through.
    """
    session = models.ForeignKey(Session, on_delete=models.CASCADE)
    student = models.PositiveIntegerField()
    dataset = models.IntegerField(default=0)

    #: Number of pp events that went into the baseline (desktop: the first 30).
    ppEvents = models.PositiveIntegerField(default=0)
    #: <M> — mean charged-primary multiplicity in pp (desktop `exportMultiplicity`).
    meanPpMultiplicity = models.FloatField(default=0.0)
    #: <M>|pT>1GeV/c (desktop `explortMultiplicityMinPt`).
    meanPpMultiplicityMinPt = models.FloatField(default=0.0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['session', 'student'], name='eer_u_fields')
        ]


class EventExplorationResultsEntry(models.Model):
    """
    One Pb-Pb centrality class of a student's submission.

    `raa` / `raaMinPt` are the two numbers the desktop `StudentValue` keeps per
    class (`raa` and `raaMinPt`, the latter for tracks with pT > 1 GeV/c).
    """
    result = models.ForeignKey(EventExplorationResult, on_delete=models.CASCADE)
    eventClass = models.CharField(max_length=16, choices=EventClass.choices)

    #: <N_coll> used for this class.
    nColl = models.FloatField()
    #: Charged primaries counted in the Pb-Pb event of this class.
    multiplicity = models.PositiveIntegerField()
    #: Same, restricted to pT > 1 GeV/c.
    multiplicityMinPt = models.PositiveIntegerField()

    raa = models.FloatField()
    raaMinPt = models.FloatField()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['result', 'eventClass'], name='eere_u_fields')
        ]
