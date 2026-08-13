import logging

from django.db import transaction
from django.core.exceptions import ObjectDoesNotExist

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response

from rest_framework.permissions import IsAuthenticated

from alice_masterclass_django.token import TemporaryTokenAuthentication
from .models import VisualAnalysisResult, VisualAnalysisResultsEntry, LargeScaleAnalysisResult, LargeScaleAnalysisResultsEntry
from masterclass.models import sessionByPassword, Session, Event, ExerciseKind

error_logger = logging.getLogger('masterclass_error')

class SubmitVisualAnalysisResultsAPI(APIView):
    def put(self, request, student, dataset):
        try:
            session = sessionByPassword(request)

            if session.event.kind != ExerciseKind.STRANGENESS:
                return Response(status=status.HTTP_403_FORBIDDEN)

            if 'results' not in request.data:
                return Response(status=status.HTTP_400_BAD_REQUEST)

            # Accept both 0-based and 1-based student numbering from clients.
            student_idx = student
            if 1 <= student <= session.maxStudents:
                student_idx = student - 1

            if student_idx < 0 or student_idx >= session.maxStudents:
                return Response(status=status.HTTP_400_BAD_REQUEST)

            with transaction.atomic():
                # delete previously submitted data (deletes all entries with it)
                VisualAnalysisResult.objects.filter(session=session, student=student_idx, dataset=dataset).delete()

                # create new result and save it to the database
                vaResult = VisualAnalysisResult(session=session, student=student_idx, dataset=dataset)
                vaResult.save()

                # create the individual sample points and check if they are valid
                samples = []
                for eventID, entry in request.data['results'].items():
                    # Accept a single sample or a list (multi-V0 events).
                    entries = entry if isinstance(entry, list) else [entry]
                    for sample in entries:
                        vaResultEntry = VisualAnalysisResultsEntry(
                            result=vaResult,
                            eventid=int(eventID),
                            particle=sample['particle'],
                            mass=sample['mass'],
                        )
                        vaResultEntry.full_clean()
                        samples.append(vaResultEntry)

                # save them in bulk to the database
                VisualAnalysisResultsEntry.objects.bulk_create(samples)

                return Response(status=status.HTTP_200_OK)
        except ObjectDoesNotExist as e:
            error_logger.error(e)
            return Response(status=status.HTTP_401_UNAUTHORIZED)
        except Exception as e:
            error_logger.error(e)
            return Response(status=status.HTTP_400_BAD_REQUEST)

class GetVisualAnalysisResultsAPI(APIView):
    authentication_classes = [TemporaryTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, id):
        sessionQuery = Session.objects.filter(id=id)

        if sessionQuery:
            session = sessionQuery.first()

            if session.event.kind != ExerciseKind.STRANGENESS:
                return Response(status=status.HTTP_403_FORBIDDEN)

            results = VisualAnalysisResult.objects.filter(session=session)

            studentList = []

            for r in results:
                studentObj = {
                    'student': r.student,
                    'dataset': r.dataset,
                    'k0': [],
                    'lambda': [],
                    'antilambda': [],
                    'xi': [],
                    'antixi': []
                }

                entries = VisualAnalysisResultsEntry.objects.filter(result=r)

                for e in entries:
                    studentObj[e.particle].append(e.mass)
                studentList.append(studentObj)
            return Response(studentList, status=status.HTTP_200_OK)
        else:
            return Response(status=status.HTTP_404_NOT_FOUND)

class SubmitLargeScaleAnalysisResultsAPI(APIView):
    def put(self, request, student):
        try:
            session = sessionByPassword(request)

            if session.event.kind != ExerciseKind.STRANGENESS:
                return Response(status=status.HTTP_403_FORBIDDEN)

            if 'results' not in request.data:
                return Response(status=status.HTTP_400_BAD_REQUEST)

            # Accept both 0-based and 1-based student numbering from clients.
            student_idx = student
            if 1 <= student <= session.maxStudents:
                student_idx = student - 1

            if student_idx < 0 or student_idx >= session.maxStudents:
                return Response(status=status.HTTP_400_BAD_REQUEST)

            with transaction.atomic():
                # delete previously submitted data (deletes all entries with it)
                LargeScaleAnalysisResult.objects.filter(session=session, student=student_idx).delete()

                # create new result and save it to the database
                lsaResult = LargeScaleAnalysisResult(session=session, student=student_idx)
                lsaResult.save()

                # create the individual sample points and check if they are valid
                samples = []
                for entry in request.data['results']:
                    lsaResultEntry = LargeScaleAnalysisResultsEntry(result=lsaResult, particle=entry['particle'], collision=entry['collision'], centrality=entry['centrality'], signal=entry['signal'])
                    lsaResultEntry.full_clean()

                    samples.append(lsaResultEntry)

                # save them in bulk to the database
                LargeScaleAnalysisResultsEntry.objects.bulk_create(samples)

                return Response(status=status.HTTP_200_OK)
        except ObjectDoesNotExist as e:
            error_logger.error(e)
            return Response(status=status.HTTP_401_UNAUTHORIZED)
        except Exception as e:
            error_logger.error(e)
            return Response(status=status.HTTP_400_BAD_REQUEST)

class GetLargeScaleAnalysisResultsAPI(APIView):
    authentication_classes = [TemporaryTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, id):
        eventQuery = Event.objects.filter(id=id)

        if eventQuery:
            event = eventQuery.first()

            if event.kind != ExerciseKind.STRANGENESS:
                return Response(status=status.HTTP_403_FORBIDDEN)

            resultsQuery = LargeScaleAnalysisResultsEntry.objects.filter(result__session__event=event)

            resultDict = {}

            for r in resultsQuery:
                resultDict.setdefault((r.particle, r.collision, r.centrality), []).append(r.signal)

            results = [{'particle': k[0], 'collision': k[1], 'centrality': k[2], 'signal': v} for k,v in resultDict.items()]

            return Response(results, status=status.HTTP_200_OK)

        return Response(status=status.HTTP_404_NOT_FOUND)
