import os

from django.core.management.base import BaseCommand

from masterclass.models import Event, ExerciseKind, Session

EVENT_NAME = 'PlaywrightE2EEvent'
SESSION_NAME = 'PlaywrightE2ESession'

JPSI_EVENT_NAME = 'PlaywrightE2EJpsiEvent'
JPSI_SESSION_NAME = 'PlaywrightE2EJpsiSession'


class Command(BaseCommand):
    help = 'Create or update event/session for Playwright E2E (idempotent).'

    def handle(self, *args, **options):
        password = os.environ.get('E2E_SESSION_PASSWORD', 'playwright-e2e')
        event, _ = Event.objects.get_or_create(name=EVENT_NAME, defaults={'kind': ExerciseKind.STRANGENESS})
        Session.objects.update_or_create(
            name=SESSION_NAME,
            defaults={
                'event': event,
                'password': password,
                'maxStudents': 15,
            },
        )

        # Separate J/psi event/session - independent sub-masterclass (Event.kind), so a
        # strangeness session's password cannot accidentally authorize a J/psi submission.
        jpsi_password = os.environ.get('E2E_JPSI_SESSION_PASSWORD', 'playwright-e2e-jpsi')
        jpsi_event, _ = Event.objects.get_or_create(name=JPSI_EVENT_NAME, defaults={'kind': ExerciseKind.JPSI})
        Session.objects.update_or_create(
            name=JPSI_SESSION_NAME,
            defaults={
                'event': jpsi_event,
                'password': jpsi_password,
                'maxStudents': 15,
            },
        )

        self.stdout.write(
            self.style.SUCCESS(
                f'Seeded session "{SESSION_NAME}" on event "{EVENT_NAME}" '
                f'(password from E2E_SESSION_PASSWORD or default) and session '
                f'"{JPSI_SESSION_NAME}" on event "{JPSI_EVENT_NAME}" '
                f'(password from E2E_JPSI_SESSION_PASSWORD or default).'
            )
        )
