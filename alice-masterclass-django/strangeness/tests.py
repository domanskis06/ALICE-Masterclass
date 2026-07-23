from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token

from .models import Particle, Collision, Centrality, VisualAnalysisResult, VisualAnalysisResultsEntry

class VisualAnalysisAPITestCase(APITestCase):
	MAX_STUDENTS = 15
	PASSWORD = 'test'

	def setUp(self):
		user = User.objects.create_user('testuser', 'test@test.com', 'test')
		user.save()
		token, _ = Token.objects.get_or_create(user=user)
		self.client.credentials(HTTP_AUTHORIZATION='Token ' + token.key)

		data = {
			'name': 'TEST'
		}

		self.client.post('/api/v1/events/', data, format='json')

		data = {
			'event': 'TEST',
			'name': 'TEST',
			'password': self.PASSWORD,
			'maxStudents': self.MAX_STUDENTS
		}
		self.client.post('/api/v1/sessions/', data, format='json')

		self.client.credentials()

	def test_create_malformed_result(self):
		student = 0
		dataset = 1

		data = {
			'password': self.PASSWORD,
			'field': 'field',
		}

		response = self.client.put(f'/api/v1/strangeness_visual_analysis/{student}/{dataset}/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

		data = {
			'password': self.PASSWORD,
			'results': False
		}

		response = self.client.put(f'/api/v1/strangeness_visual_analysis/{student}/{dataset}/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

		data = {
			'password': self.PASSWORD,
			'results': {
				'string': {
					'particle': Particle.K0,
					'mass': 1
				}
			}
		}

		response = self.client.put(f'/api/v1/strangeness_visual_analysis/{student}/{dataset}/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

		data = {
			'password': self.PASSWORD,
			'results': {
				'test': {
					'particle': Particle.K0,
					'mass': 'k0'
				}
			}
		}

		response = self.client.put(f'/api/v1/strangeness_visual_analysis/{student}/{dataset}/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

		data = {
			'password': self.PASSWORD,
			'results': {
				'0': {
					'particle': 'test',
					'mass': 1
				}
			}
		}

		response = self.client.put(f'/api/v1/strangeness_visual_analysis/{student}/{dataset}/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_unauthorized(self):
		student = 0
		dataset = 1

		data = {
			'password': 'not-test',
			'results': {
				'0': {
					'particle': Particle.K0,
					'mass': 1
				}
			}
		}

		response = self.client.put(f'/api/v1/strangeness_visual_analysis/{student}/{dataset}/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

	def test_create_result(self):
		student = 0
		dataset = 1
		eventid = 0
		particle = Particle.K0
		mass = 1

		data = {
			'password': self.PASSWORD,
			'results': {
				str(eventid): {
					'particle': particle,
					'mass': mass
				}
			}
		}

		response = self.client.put(f'/api/v1/strangeness_visual_analysis/{student}/{dataset}/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_200_OK)

		self.assertEqual(VisualAnalysisResult.objects.count(), 1)
		self.assertEqual(VisualAnalysisResult.objects.get().student, student)
		self.assertEqual(VisualAnalysisResult.objects.get().dataset, dataset)

		self.assertEqual(VisualAnalysisResultsEntry.objects.count(), 1)
		self.assertEqual(VisualAnalysisResultsEntry.objects.get().eventid, eventid)
		self.assertEqual(VisualAnalysisResultsEntry.objects.get().particle, particle)
		self.assertEqual(VisualAnalysisResultsEntry.objects.get().mass, mass)

	def test_create_result_multi_v0_same_event(self):
		"""Multi-V0 events may submit several mother particles under one event id."""
		student = 0
		dataset = 1
		eventid = 0

		data = {
			'password': self.PASSWORD,
			'results': {
				str(eventid): [
					{'particle': Particle.K0, 'mass': 0.5},
					{'particle': Particle.LAMBDA, 'mass': 1.1},
				]
			}
		}

		response = self.client.put(f'/api/v1/strangeness_visual_analysis/{student}/{dataset}/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_200_OK)

		self.assertEqual(VisualAnalysisResult.objects.count(), 1)
		self.assertEqual(VisualAnalysisResultsEntry.objects.count(), 2)
		self.assertEqual(VisualAnalysisResultsEntry.objects.filter(eventid=eventid).count(), 2)
		self.assertEqual(
			set(VisualAnalysisResultsEntry.objects.values_list('particle', flat=True)),
			{Particle.K0, Particle.LAMBDA},
		)

	def test_create_result2(self):
		student = 0
		dataset = 1
		eventid = [0, 1]
		particle = [Particle.K0, Particle.LAMBDA]
		mass = [1, 2]

		data = {
			'password': self.PASSWORD,
			'results': {str(e): {'particle': p, 'mass': m} for e,p,m in zip(eventid, particle, mass)}
		}

		response = self.client.put(f'/api/v1/strangeness_visual_analysis/{student}/{dataset}/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_200_OK)

		self.assertEqual(VisualAnalysisResult.objects.count(), 1)
		self.assertEqual(VisualAnalysisResult.objects.get().student, student)
		self.assertEqual(VisualAnalysisResult.objects.get().dataset, dataset)

		self.assertEqual(VisualAnalysisResultsEntry.objects.count(), 2)

		for e,p,m in zip(eventid, particle, mass):
			self.assertEqual(VisualAnalysisResultsEntry.objects.filter(eventid=e).get().eventid, e)
			self.assertEqual(VisualAnalysisResultsEntry.objects.filter(eventid=e).get().particle, p)
			self.assertEqual(VisualAnalysisResultsEntry.objects.filter(eventid=e).get().mass, m)

	def test_create_result2_update(self):
		student = 0
		dataset = 1
		eventid = [0, 1, 2]
		particle = [Particle.K0, Particle.LAMBDA, Particle.ANTILAMBDA]
		mass = [1, 2, 3]

		data1 = {
			'password': self.PASSWORD,
			'results': {str(e): {'particle': p, 'mass': m} for e, p, m in list(zip(eventid, particle, mass))[:2]}
		}

		response = self.client.put(f'/api/v1/strangeness_visual_analysis/{student}/{dataset}/', data1, format='json')
		self.assertEqual(response.status_code, status.HTTP_200_OK)

		data2 = {
			'password': self.PASSWORD,
			'results': {str(e): {'particle': p, 'mass': m} for e, p, m in zip(eventid, particle, mass)}
		}

		response = self.client.put(f'/api/v1/strangeness_visual_analysis/{student}/{dataset}/', data2, format='json')
		self.assertEqual(response.status_code, status.HTTP_200_OK)

		self.assertEqual(VisualAnalysisResultsEntry.objects.count(), 3)

		for e,p,m in zip(eventid, particle, mass):
			self.assertEqual(VisualAnalysisResultsEntry.objects.filter(eventid=e).get().eventid, e)
			self.assertEqual(VisualAnalysisResultsEntry.objects.filter(eventid=e).get().particle, p)
			self.assertEqual(VisualAnalysisResultsEntry.objects.filter(eventid=e).get().mass, m)

	def test_create_result2_update_malformed(self):
		student = 0
		dataset = 1
		eventid = [0, 1, 2]
		particle = [Particle.K0, Particle.LAMBDA, Particle.ANTILAMBDA]
		mass = [1, 2, 3]

		data1 = {
			'password': self.PASSWORD,
			'results': {str(e): {'particle': p, 'mass': m} for e, p, m in list(zip(eventid, particle, mass))[:2]}
		}

		response = self.client.put(f'/api/v1/strangeness_visual_analysis/{student}/{dataset}/', data1, format='json')
		self.assertEqual(response.status_code, status.HTTP_200_OK)

		dataMalformed = {
			'password': self.PASSWORD,
			'results': {str(e): {'particle': p, 'mass': m} for e, p, m in zip(eventid, particle, mass)}
		}

		dataMalformed['results']['2']['mass'] = 'test'

		response = self.client.put(f'/api/v1/strangeness_visual_analysis/{student}/{dataset}/', dataMalformed, format='json')
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

		self.assertEqual(VisualAnalysisResultsEntry.objects.count(), 2)

		for e,p,m in list(zip(eventid, particle, mass))[:2]:
			self.assertEqual(VisualAnalysisResultsEntry.objects.filter(eventid=e).get().eventid, e)
			self.assertEqual(VisualAnalysisResultsEntry.objects.filter(eventid=e).get().particle, p)
			self.assertEqual(VisualAnalysisResultsEntry.objects.filter(eventid=e).get().mass, m)

class GetVisualAnalysisResultsAPITestCase(APITestCase):
	EVENT_NAME = 'TEST'
	NAME = 'TEST'
	MAX_STUDENTS = 15
	PASSWORD = 'test'
	STUDENT = 0
	DATASET = 1
	EVENTID = [0, 1, 2]
	PARTCILE = [Particle.K0, Particle.LAMBDA, Particle.ANTILAMBDA]
	MASS = [1, 2, 3]

	def setUp(self):
		user = User.objects.create_user('testuser', 'test@test.com', 'test')
		user.save()
		token, _ = Token.objects.get_or_create(user=user)

		self.tokenKey = token.key

		self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.tokenKey)

		data = {
			'name': self.EVENT_NAME
		}

		self.client.post('/api/v1/events/', data, format='json')

		data = {
			'event': self.EVENT_NAME,
			'name': self.NAME,
			'password': self.PASSWORD,
			'maxStudents': self.MAX_STUDENTS
		}
		self.client.post('/api/v1/sessions/', data, format='json')

		self.client.credentials()

		data = {
			'password': self.PASSWORD,
			'results': {str(e): {'particle': p, 'mass': m} for e, p, m in zip(self.EVENTID, self.PARTCILE, self.MASS)}
		}

		self.client.put(f'/api/v1/strangeness_visual_analysis/{self.STUDENT}/{self.DATASET}/', data, format='json')

	def test_get_results(self):
		self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.tokenKey)

		response = self.client.get('/api/v1/sessions/')
		id = response.data[0]['id']

		response = self.client.get(f'/api/v1/strangeness_visual_analysis_results/{id}/', format='json')
		self.assertEqual(response.status_code, status.HTTP_200_OK)

		self.assertEqual(len(response.data), 1)

		studentObj = response.data[0]

		self.assertEqual(studentObj['student'], self.STUDENT)
		self.assertEqual(studentObj['dataset'], self.DATASET)
		self.assertEqual(len(studentObj['k0']), 1)
		self.assertEqual(len(studentObj['lambda']), 1)
		self.assertEqual(len(studentObj['antilambda']), 1)
		self.assertEqual(len(studentObj['xi']), 0)

class GetLargeScaleAnalysisResultsAPITestCase(APITestCase):
	EVENT_NAME = 'TEST'
	NAME = 'TEST'
	MAX_STUDENTS = 15
	PASSWORD = 'test'
	STUDENT = 0
	PARTCILE = [Particle.K0, Particle.LAMBDA, Particle.ANTILAMBDA]
	COLLISION = [Collision.PBPB, Collision.PBPB, Collision.PBPB]
	CENTRALITY = [Centrality.c000_010, Centrality.c000_010, Centrality.c000_010]
	SIGNAL = [10, 20, 30]

	def setUp(self):
		user = User.objects.create_user('testuser', 'test@test.com', 'test')
		user.save()
		token, _ = Token.objects.get_or_create(user=user)

		self.tokenKey = token.key

		self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.tokenKey)

		data = {
			'name': self.EVENT_NAME
		}

		self.client.post('/api/v1/events/', data, format='json')

		data = {
			'event': self.EVENT_NAME,
			'name': self.NAME,
			'password': self.PASSWORD,
			'maxStudents': self.MAX_STUDENTS
		}

		self.client.post('/api/v1/sessions/', data, format='json')

		self.client.credentials()

		data = {
			'password': self.PASSWORD,
			'results': [{'particle': p, 'collision': co, 'centrality': ce, 'signal': s} for p, co, ce, s in zip(self.PARTCILE, self.COLLISION, self.CENTRALITY, self.SIGNAL)]
		}

		self.client.put(f'/api/v1/strangeness_large_scale_analysis/{self.STUDENT}/', data, format='json')

	def test_get_results(self):
		self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.tokenKey)

		response = self.client.get('/api/v1/events/')
		id = response.data[0]['id']

		response = self.client.get(f'/api/v1/strangeness_large_scale_analysis_results/{id}/', format='json')
		self.assertEqual(response.status_code, status.HTTP_200_OK)

		self.assertEqual(len(response.data), 3)

		for entry, p, ce, co, s in zip(response.data, self.PARTCILE, self.CENTRALITY, self.COLLISION, self.SIGNAL):
			self.assertEqual(entry['particle'], p)
			self.assertEqual(entry['centrality'], ce)
			self.assertEqual(entry['collision'], co)
			self.assertEqual(len(entry['signal']), 1)
			self.assertEqual(entry['signal'][0], s)
