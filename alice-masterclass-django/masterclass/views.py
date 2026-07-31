import json
import logging
import requests
import urllib.parse

from django.conf import settings
from django.core.exceptions import ValidationError, BadRequest, ObjectDoesNotExist
from django.shortcuts import redirect

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from alice_masterclass_django.token import TemporaryTokenAuthentication
from masterclass.serializers import EventSerializer, SessionSerializer
from masterclass.models import Event, sessionByPassword, Session

error_logger = logging.getLogger('masterclass_error')

def _has_unique_error(serializer):
    def _walk(errors):
        if isinstance(errors, dict):
            return any(_walk(value) for value in errors.values())
        if isinstance(errors, list):
            return any(_walk(item) for item in errors)
        return getattr(errors, 'code', None) == 'unique'

    return _walk(serializer.errors)

class OAuthAPI(APIView):
    def get(self, request):
        params = {
            'grant_type': 'authorization_code',
            'code': request.query_params['code'],
            'redirect_uri': settings.REDIRECT_URI,
            'client_id': settings.CLIENT_ID,
            'client_secret': settings.CLIENT_SECRET
        }
        r = requests.post(settings.LOGIN_URL, data=params)

        if r.status_code == status.HTTP_200_OK:
            token_data = json.loads(r.text)
            headers = {'Authorization': f'Bearer {token_data["access_token"]}'}
            r2 = requests.get(settings.INFO_URL, headers=headers)

            if r2.status_code == status.HTTP_200_OK:
                user_data = json.loads(r2.text)

                username = user_data['cern_upn']
                email = user_data['email']

                token = TemporaryTokenAuthentication.createOrRefreshToken(username, email)

                return redirect(f'{settings.FRONTEND_URL}?token={urllib.parse.quote_plus(token.key)}')

        return Response(status=status.HTTP_400_BAD_REQUEST)

class TokenAPI(APIView):
    authentication_classes = [TemporaryTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(status=status.HTTP_200_OK)

class EventCreateListAPI(APIView):
    authentication_classes = [TemporaryTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = EventSerializer(Event.objects.all(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        event = EventSerializer(data=request.data)

        if event.is_valid():
            try:
                event.save()
                return Response(status=status.HTTP_201_CREATED)
            except ValidationError as e:
                return Response(status=status.HTTP_409_CONFLICT)

        if _has_unique_error(event):
            return Response(status=status.HTTP_409_CONFLICT)

        return Response(status=status.HTTP_400_BAD_REQUEST)

class EventDeleteAPI(APIView):
    authentication_classes = [TemporaryTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def delete(self, request, id):
        eventQuery = Event.objects.filter(id=id)

        if eventQuery:
            event = eventQuery.first()
            event.delete()
            return Response(status=status.HTTP_200_OK)
        else:
            return Response(status=status.HTTP_404_NOT_FOUND)

class SessionCreateListAPI(APIView):
    authentication_classes = [TemporaryTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = SessionSerializer(Session.objects.all(), many=True)

        # add event name
        for entry in serializer.data:
            session = Session.objects.filter(name=entry['name']).first()
            entry['event'] = session.event.name

        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        if 'event' in request.data:
            eventName = request.data.pop('event')

            eventQuery = Event.objects.filter(name=eventName)

            if eventQuery:
                event = eventQuery.first()

                session = SessionSerializer(data=request.data)

                if session.is_valid():
                    try:
                        session.save(event=event)
                        return Response(status=status.HTTP_201_CREATED)
                    except ValidationError as e:
                        return Response(status=status.HTTP_409_CONFLICT)

                if _has_unique_error(session):
                    return Response(status=status.HTTP_409_CONFLICT)

        return Response(status=status.HTTP_400_BAD_REQUEST)

class SessionDeleteAPI(APIView):
    authentication_classes = [TemporaryTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def delete(self, request, id):
        sessionQuery = Session.objects.filter(id=id)

        if sessionQuery:
            session = sessionQuery.first()
            session.delete()
            return Response(status=status.HTTP_200_OK)
        else:
            return Response(status=status.HTTP_404_NOT_FOUND)

class CheckSessionAPI(APIView):
    def put(self, request):
        try:
            session = sessionByPassword(request)
        except BadRequest:
            return Response(status=status.HTTP_400_BAD_REQUEST)
        except ObjectDoesNotExist:
            return Response(
                {'error': True, 'reason': 'password', 'name': ''},
                status=status.HTTP_200_OK
            )

        student = request.data.get('student', None)
        allow_existing = bool(request.data.get('allow_existing', False))

        if student is not None and student != '':
            try:
                student = int(student)
            except (TypeError, ValueError):
                return Response(status=status.HTTP_400_BAD_REQUEST)

            # Accept both 0-based and 1-based student numbering (same as result APIs).
            student_idx = student
            if 1 <= student <= session.maxStudents:
                student_idx = student - 1

            if student_idx < 0 or student_idx >= session.maxStudents:
                return Response(
                    {
                        'error': True,
                        'reason': 'student_invalid',
                        'name': session.name,
                        'maxStudents': session.maxStudents,
                    },
                    status=status.HTTP_200_OK,
                )

            if not allow_existing:
                from strangeness.models import VisualAnalysisResult, LargeScaleAnalysisResult

                taken = (
                    VisualAnalysisResult.objects.filter(session=session, student=student_idx).exists()
                    or LargeScaleAnalysisResult.objects.filter(session=session, student=student_idx).exists()
                )
                if taken:
                    return Response(
                        {
                            'error': True,
                            'reason': 'student_taken',
                            'name': session.name,
                            'maxStudents': session.maxStudents,
                        },
                        status=status.HTTP_200_OK,
                    )

        return Response(
            {
                'error': False,
                'reason': '',
                'name': session.name,
                'maxStudents': session.maxStudents,
            },
            status=status.HTTP_200_OK,
        )
