from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token

from .models import Event, Session

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
