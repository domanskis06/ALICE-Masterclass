from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token

from .models import Event, ExerciseKind, Session

class EventCreateListAPITestCase(APITestCase):
	def setUp(self):
		user = User.objects.create_user('testuser', 'test@test.com', 'test')
		user.save()
		token, _ = Token.objects.get_or_create(user=user)
		self.client.credentials(HTTP_AUTHORIZATION='Token ' + token.key)
	
	def test_create_malformed(self):
		data = {
		}
		response = self.client.post('/api/v1/events/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_create_event(self):
		data = {
			'name': 'TEST'
		}
		response = self.client.post('/api/v1/events/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(Event.objects.count(), 1)
		self.assertEqual(Event.objects.get().name, data['name'])

	def test_duplicate_event(self):
		data = {
			'name': 'TEST'
		}

		response = self.client.post('/api/v1/events/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)

		response = self.client.post('/api/v1/events/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

		self.assertEqual(Event.objects.count(), 1)
		self.assertEqual(Event.objects.get().name, data['name'])

	def test_create_event_defaults_to_strangeness_kind(self):
		response = self.client.post('/api/v1/events/', {'name': 'TEST'}, format='json')
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(Event.objects.get().kind, ExerciseKind.STRANGENESS)

	def test_create_event_with_kind(self):
		response = self.client.post('/api/v1/events/', {'name': 'TEST', 'kind': ExerciseKind.JPSI}, format='json')
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(Event.objects.get().kind, ExerciseKind.JPSI)

	def test_filter_events_by_kind(self):
		self.client.post('/api/v1/events/', {'name': 'STRANGE', 'kind': ExerciseKind.STRANGENESS}, format='json')
		self.client.post('/api/v1/events/', {'name': 'JPSI', 'kind': ExerciseKind.JPSI}, format='json')
		self.client.post('/api/v1/events/', {'name': 'RAA', 'kind': ExerciseKind.RAA}, format='json')

		response = self.client.get('/api/v1/events/', {'kind': ExerciseKind.JPSI})
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual([e['name'] for e in response.data], ['JPSI'])

		response = self.client.get('/api/v1/events/')
		self.assertEqual(len(response.data), 3)

	def test_filter_events_by_invalid_kind(self):
		response = self.client.get('/api/v1/events/', {'kind': 'not-a-kind'})
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

class EventDeleteAPITestCase(APITestCase):
	EVENT_NAME = 'TEST'

	def setUp(self):
		user = User.objects.create_user('testuser', 'test@test.com', 'test')
		user.save()
		token, _ = Token.objects.get_or_create(user=user)
		self.client.credentials(HTTP_AUTHORIZATION='Token ' + token.key)

		data = {
			'name': self.EVENT_NAME
		}

		response = self.client.post('/api/v1/events/', data, format='json')

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(Event.objects.count(), 1)
		self.assertEqual(Event.objects.get().name, data['name'])

	def test_delete(self):
		response = self.client.get('/api/v1/events/')
		id = response.data[0]['id']
		response = self.client.delete(f'/api/v1/events/{id}/')
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(Event.objects.count(), 0)

class SessionCreateListAPITestCase(APITestCase):
	EVENT_NAME = 'TEST'

	def setUp(self):
		user = User.objects.create_user('testuser', 'test@test.com', 'test')
		user.save()
		token, _ = Token.objects.get_or_create(user=user)
		self.client.credentials(HTTP_AUTHORIZATION='Token ' + token.key)

		data = {
			'name': self.EVENT_NAME
		}

		self.client.post('/api/v1/events/', data, format='json')

	def test_create_malformed(self):
		data = {
			'event': self.EVENT_NAME,
			'name': 'TEST',
		}
		response = self.client.post('/api/v1/sessions/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

		data = {
			'name': 'TEST',
			'password': 'test',
			'maxStudents': 'test'
		}
		response = self.client.post('/api/v1/sessions/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_create_session(self):
		data = {
			'event': self.EVENT_NAME,
			'name': 'TEST',
			'password': 'test',
			'maxStudents': 15
		}
		response = self.client.post('/api/v1/sessions/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(Session.objects.count(), 1)
		self.assertEqual(Session.objects.get().name, data['name'])

	def test_duplicate_session(self):
		data = {
			'event': self.EVENT_NAME,
			'name': 'TEST',
			'password': 'test',
			'maxStudents': 15
		}

		response = self.client.post('/api/v1/sessions/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)

		response = self.client.post('/api/v1/sessions/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

		self.assertEqual(Session.objects.count(), 1)
		self.assertEqual(Session.objects.get().name, data['name'])

	def test_get_sessions(self):

		dataCreate = [
			{
				'event': self.EVENT_NAME,
				'name': 'TEST1',
				'password': 'test1',
				'maxStudents': 15
			},
			{
				'event': self.EVENT_NAME,
				'name': 'TEST2',
				'password': 'test2',
				'maxStudents': 15
			}
		]

		response = self.client.post('/api/v1/sessions/', dataCreate[0], format='json')
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)

		response = self.client.post('/api/v1/sessions/', dataCreate[1], format='json')
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)

		response = self.client.get('/api/v1/sessions/')

		self.assertEqual(Session.objects.count(), len(dataCreate))

		for i, elm in enumerate(response.data):
			for k,v in dataCreate[i].items():
				if k != 'event':
					self.assertEqual(elm[k], v)

	def test_sessions_expose_event_kind(self):
		self.client.post('/api/v1/sessions/', {
			'event': self.EVENT_NAME,
			'name': 'TEST',
			'password': 'test',
			'maxStudents': 15
		}, format='json')

		response = self.client.get('/api/v1/sessions/')
		self.assertEqual(response.data[0]['kind'], ExerciseKind.STRANGENESS)

class SessionDeleteAPITestCase(APITestCase):
	EVENT_NAME = 'TEST'
	NAME = 'TEST'

	def setUp(self):
		user = User.objects.create_user('testuser', 'test@test.com', 'test')
		user.save()
		token, _ = Token.objects.get_or_create(user=user)
		self.client.credentials(HTTP_AUTHORIZATION='Token ' + token.key)

		data = {
			'name': self.EVENT_NAME
		}

		self.client.post('/api/v1/events/', data, format='json')

		data = {
			'event': self.EVENT_NAME,
			'name': self.NAME,
			'password': 'test',
			'maxStudents': 15
		}
		response = self.client.post('/api/v1/sessions/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(Session.objects.count(), 1)
		self.assertEqual(Session.objects.get().name, data['name'])

	def test_delete(self):
		response = self.client.get('/api/v1/sessions/')
		id = response.data[0]['id']
		response = self.client.delete(f'/api/v1/sessions/{id}/')
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(Session.objects.count(), 0)

class CheckSessionAPITestCase(APITestCase):
	EVENT_NAME = 'TEST'

	def setUp(self):
		user = User.objects.create_user('testuser', 'test@test.com', 'test')
		user.save()
		token, _ = Token.objects.get_or_create(user=user)

		data = {
			'name': self.EVENT_NAME
		}

		self.tokenKey = token.key

		self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.tokenKey)

		self.client.post('/api/v1/events/', data, format='json')

		self.client.credentials()

	def test_access_session_malformed(self):
		response = self.client.put('/api/v1/check_session/', {}, format='json')
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_access_session(self):
		self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.tokenKey)

		dateCreate = {
			'event': self.EVENT_NAME,
			'name': 'TEST',
			'password': 'test',
			'maxStudents': 15
		}

		response = self.client.post('/api/v1/sessions/', dateCreate, format='json')
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)

		self.client.credentials()

		dataAuthCorrect = {
			'password': dateCreate['password']
		}

		response = self.client.put('/api/v1/check_session/', dataAuthCorrect, format='json')
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data['error'], False)
		self.assertEqual(response.data['name'], dateCreate['name'])
		# Lets the student app gate uploads client-side (see ApiService.matchesSessionKind) -
		# new events default to strangeness (ExerciseKind.STRANGENESS).
		self.assertEqual(response.data['kind'], ExerciseKind.STRANGENESS)

		dataAuthIncorrect = {
			'password': 'not-test'
		}

		response = self.client.put('/api/v1/check_session/', dataAuthIncorrect, format='json')
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data['error'], True)
		self.assertEqual(response.data['reason'], 'password')
		self.assertEqual(response.data['name'], '')

	def test_access_correct_session(self):
		self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.tokenKey)

		dateCreate1 = {
			'event': self.EVENT_NAME,
			'name': 'TEST1',
			'password': 'test1',
			'maxStudents': 15
		}

		dateCreate2 = {
			'event': self.EVENT_NAME,
			'name': 'TEST2',
			'password': 'test2',
			'maxStudents': 15
		}

		response = self.client.post('/api/v1/sessions/', dateCreate1, format='json')
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)

		response = self.client.post('/api/v1/sessions/', dateCreate2, format='json')
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)

		self.client.credentials()

		dataAuth = {
			'password': dateCreate1['password']
		}

		response = self.client.put('/api/v1/check_session/', dataAuth, format='json')
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data['error'], False)
		self.assertEqual(response.data['name'], dateCreate1['name'])

class StudentTakenAcrossKindsAPITestCase(APITestCase):
	"""A student id is only "taken" within its own sub-masterclass - the same id can
	independently take the strangeness and J/psi masterclasses (see `_student_taken`)."""
	MAX_STUDENTS = 15
	STRANGENESS_PASSWORD = 'strangeness-pw'
	JPSI_PASSWORD = 'jpsi-pw'
	STUDENT = 0

	def setUp(self):
		user = User.objects.create_user('testuser', 'test@test.com', 'test')
		user.save()
		token, _ = Token.objects.get_or_create(user=user)
		self.client.credentials(HTTP_AUTHORIZATION='Token ' + token.key)

		self.client.post('/api/v1/events/', {'name': 'STRANGENESS_EVENT', 'kind': ExerciseKind.STRANGENESS}, format='json')
		self.client.post('/api/v1/sessions/', {
			'event': 'STRANGENESS_EVENT',
			'name': 'STRANGENESS_SESSION',
			'password': self.STRANGENESS_PASSWORD,
			'maxStudents': self.MAX_STUDENTS,
		}, format='json')

		self.client.post('/api/v1/events/', {'name': 'JPSI_EVENT', 'kind': ExerciseKind.JPSI}, format='json')
		self.client.post('/api/v1/sessions/', {
			'event': 'JPSI_EVENT',
			'name': 'JPSI_SESSION',
			'password': self.JPSI_PASSWORD,
			'maxStudents': self.MAX_STUDENTS,
		}, format='json')

		self.client.credentials()

	def test_student_taken_does_not_cross_kinds(self):
		from strangeness.models import LargeScaleAnalysisResult
		from jpsi.models import JpsiAnalysisResult, JpsiAnalysisResultEntry, CollisionSystem

		strangeness_session = Session.objects.get(name='STRANGENESS_SESSION')
		LargeScaleAnalysisResult.objects.create(session=strangeness_session, student=self.STUDENT)

		# Same student id is still free in the (independent) J/psi session.
		response = self.client.put('/api/v1/check_session/', {
			'password': self.JPSI_PASSWORD,
			'student': self.STUDENT,
		}, format='json')
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data['error'], False)

		# ...but it is indeed taken within the strangeness session itself.
		response = self.client.put('/api/v1/check_session/', {
			'password': self.STRANGENESS_PASSWORD,
			'student': self.STUDENT,
		}, format='json')
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data['error'], True)
		self.assertEqual(response.data['reason'], 'student_taken')

		jpsi_session = Session.objects.get(name='JPSI_SESSION')
		jpsi_result = JpsiAnalysisResult.objects.create(session=jpsi_session, student=self.STUDENT)
		JpsiAnalysisResultEntry.objects.create(result=jpsi_result, system=CollisionSystem.PP, signal=1, signalError=1, nEvents=1)

		# Now taken in J/psi too, independently of the strangeness result above.
		response = self.client.put('/api/v1/check_session/', {
			'password': self.JPSI_PASSWORD,
			'student': self.STUDENT,
		}, format='json')
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data['error'], True)
		self.assertEqual(response.data['reason'], 'student_taken')
