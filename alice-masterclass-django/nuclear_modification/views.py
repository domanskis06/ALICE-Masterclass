import logging

from django.db import transaction
from django.core.exceptions import ObjectDoesNotExist

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from alice_masterclass_django.token import TemporaryTokenAuthentication
from masterclass.models import sessionByPassword, Session

from .models import EventExplorationResult, EventExplorationResultsEntry
from .serializers import EventExplorationResultSerializer

error_logger = logging.getLogger('masterclass_error')


class SubmitEventExplorationResultsAPI(APIView):
    """
    Student upload for the Nuclear Modification "Event Exploration" exercise.

    Authenticated by the session password, exactly like the strangeness submit
    endpoints. Re-submitting replaces the student's previous row, so the student
    app can push after every publish without creating duplicates.
    """

    def put(self, request, student):
        try:
            session = sessionByPassword(request)

            if 'results' not in request.data:
                return Response(status=status.HTTP_400_BAD_REQUEST)

            results = request.data['results']
            if not isinstance(results, dict):
                return Response(status=status.HTTP_400_BAD_REQUEST)

            classes = results.get('classes', [])
            if not isinstance(classes, list):
                return Response(status=status.HTTP_400_BAD_REQUEST)

            # Accept both 0-based and 1-based student numbering from clients.
            student_idx = student
            if 1 <= student <= session.maxStudents:
                student_idx = student - 1

            if student_idx < 0 or student_idx >= session.maxStudents:
                return Response(status=status.HTTP_400_BAD_REQUEST)

            with transaction.atomic():
                # delete previously submitted data (deletes all entries with it)
                EventExplorationResult.objects.filter(
                    session=session, student=student_idx
                ).delete()

                result = EventExplorationResult(
                    session=session,
                    student=student_idx,
                    dataset=request.data.get('dataset', 0),
                    ppEvents=results.get('ppEvents', 0),
                    meanPpMultiplicity=results.get('meanPpMultiplicity', 0.0),
                    meanPpMultiplicityMinPt=results.get('meanPpMultiplicityMinPt', 0.0),
                )
                result.full_clean()
                result.save()

                entries = []
                for entry in classes:
                    resultEntry = EventExplorationResultsEntry(
                        result=result,
                        eventClass=entry['eventClass'],
                        nColl=entry['nColl'],
                        multiplicity=entry['multiplicity'],
                        multiplicityMinPt=entry['multiplicityMinPt'],
                        raa=entry['raa'],
                        raaMinPt=entry['raaMinPt'],
                    )
                    resultEntry.full_clean()
                    entries.append(resultEntry)

                EventExplorationResultsEntry.objects.bulk_create(entries)

                return Response(status=status.HTTP_200_OK)
        except ObjectDoesNotExist as e:
            error_logger.error(e)
            return Response(status=status.HTTP_401_UNAUTHORIZED)
        except Exception as e:
            error_logger.error(e)
            return Response(status=status.HTTP_400_BAD_REQUEST)


class GetEventExplorationResultsAPI(APIView):
    """Teacher-side read of every student's part-1 R_AA values in a session."""

    authentication_classes = [TemporaryTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, id):
        sessionQuery = Session.objects.filter(id=id)

        if not sessionQuery:
            return Response(status=status.HTTP_404_NOT_FOUND)

        session = sessionQuery.first()
        results = (
            EventExplorationResult.objects.filter(session=session)
            .prefetch_related('eventexplorationresultsentry_set')
            .order_by('student')
        )

        serializer = EventExplorationResultSerializer(results, many=True)

        return Response(serializer.data, status=status.HTTP_200_OK)
