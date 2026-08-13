import logging

from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.db import transaction

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from alice_masterclass_django.token import TemporaryTokenAuthentication
from masterclass.models import Event, ExerciseKind, sessionByPassword

from .models import JpsiAnalysisResult, JpsiAnalysisResultEntry
from .serializers import JpsiAnalysisResultEntrySerializer

error_logger = logging.getLogger('masterclass_error')


class SubmitJpsiAnalysisResultsAPI(APIView):
    def put(self, request, student):
        try:
            session = sessionByPassword(request)

            # Guards against a J/psi payload landing in a strangeness/R_AA session (or
            # vice-versa) - the three sub-masterclasses are independent (see Event.kind).
            if session.event.kind != ExerciseKind.JPSI:
                return Response(status=status.HTTP_403_FORBIDDEN)

            if 'results' not in request.data or not isinstance(request.data['results'], list):
                return Response(status=status.HTTP_400_BAD_REQUEST)

            # Accept both 0-based and 1-based student numbering (same as the other result APIs).
            student_idx = student
            if 1 <= student <= session.maxStudents:
                student_idx = student - 1

            if student_idx < 0 or student_idx >= session.maxStudents:
                return Response(status=status.HTTP_400_BAD_REQUEST)

            entries_data = []
            seen_systems = set()

            for entry in request.data['results']:
                serializer = JpsiAnalysisResultEntrySerializer(data=entry)

                if not serializer.is_valid():
                    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

                system = serializer.validated_data['system']
                if system in seen_systems:
                    return Response(status=status.HTTP_400_BAD_REQUEST)
                seen_systems.add(system)

                entries_data.append(serializer.validated_data)

            with transaction.atomic():
                # delete previously submitted data (deletes all entries with it)
                JpsiAnalysisResult.objects.filter(session=session, student=student_idx).delete()

                # create new result and save it to the database
                jpsiResult = JpsiAnalysisResult(session=session, student=student_idx)
                jpsiResult.save()

                # create the individual per-system entries and check they are valid
                entries = [JpsiAnalysisResultEntry(result=jpsiResult, **data) for data in entries_data]
                for entry in entries:
                    entry.full_clean()

                # save them in bulk to the database
                JpsiAnalysisResultEntry.objects.bulk_create(entries)

            return Response(status=status.HTTP_200_OK)
        except ObjectDoesNotExist as e:
            error_logger.error(e)
            return Response(status=status.HTTP_401_UNAUTHORIZED)
        except ValidationError as e:
            error_logger.error(e)
            return Response(status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            error_logger.error(e)
            return Response(status=status.HTTP_400_BAD_REQUEST)


class GetJpsiAnalysisResultsAPI(APIView):
    authentication_classes = [TemporaryTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, id):
        eventQuery = Event.objects.filter(id=id)

        if not eventQuery:
            return Response(status=status.HTTP_404_NOT_FOUND)

        event = eventQuery.first()

        if event.kind != ExerciseKind.JPSI:
            return Response(status=status.HTTP_403_FORBIDDEN)

        entries = JpsiAnalysisResultEntry.objects.filter(result__session__event=event)

        # Group raw per-student values by system - same "leave the averaging to the client"
        # convention as GetLargeScaleAnalysisResultsAPI, so the teacher app's reload() logic
        # stays consistent across sub-masterclasses.
        aggregated = {}
        for entry in entries:
            bucket = aggregated.setdefault(entry.system, {'signal': [], 'signalError': [], 'nEvents': []})
            bucket['signal'].append(entry.signal)
            bucket['signalError'].append(entry.signalError)
            if entry.nEvents is not None:
                bucket['nEvents'].append(entry.nEvents)

        results = [
            {
                'system': system,
                'signal': bucket['signal'],
                'signalError': bucket['signalError'],
                'nEvents': bucket['nEvents'],
            }
            for system, bucket in aggregated.items()
        ]

        return Response(results, status=status.HTTP_200_OK)
