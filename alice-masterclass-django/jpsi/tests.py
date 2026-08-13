from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token

from masterclass.models import ExerciseKind
from .models import CollisionSystem, JpsiAnalysisResult, JpsiAnalysisResultEntry


class SubmitJpsiAnalysisResultsAPITestCase(APITestCase):
	EVENT_NAME = 'JPSI_TEST'
	NAME = 'JPSI_TEST'
	MAX_STUDENTS = 15
	PASSWORD = 'test'

	def setUp(self):
		user = User.objects.create_user('testuser', 'test@test.com', 'test')
		user.save()
		token, _ = Token.objects.get_or_create(user=user)
		self.client.credentials(HTTP_AUTHORIZATION='Token ' + token.key)

		self.client.post('/api/v1/events/', {'name': self.EVENT_NAME, 'kind': ExerciseKind.JPSI}, format='json')

		self.client.post('/api/v1/sessions/', {
			'event': self.EVENT_NAME,
			'name': self.NAME,
			'password': self.PASSWORD,
			'maxStudents': self.MAX_STUDENTS,
		}, format='json')

		self.client.credentials()

	def test_create_malformed(self):
		student = 0

		response = self.client.put(f'/api/v1/jpsi_analysis/{student}/', {'password': self.PASSWORD}, format='json')
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

		response = self.client.put(f'/api/v1/jpsi_analysis/{student}/', {'password': self.PASSWORD, 'results': False}, format='json')
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_unauthorized(self):
		student = 0

		data = {
			'password': 'not-test',
			'results': [{'system': CollisionSystem.PP, 'signal': 59, 'signalError': 8, 'nEvents': 1000}],
		}

		response = self.client.put(f'/api/v1/jpsi_analysis/{student}/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

	def test_wrong_kind_forbidden(self):
		"""A strangeness session must reject J/psi submissions (sub-masterclasses are independent)."""
		self.client.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.get().key)
		self.client.post('/api/v1/events/', {'name': 'STRANGENESS_TEST'}, format='json')
		self.client.post('/api/v1/sessions/', {
			'event': 'STRANGENESS_TEST',
			'name': 'STRANGENESS_SESSION',
			'password': 'strangeness-pw',
			'maxStudents': self.MAX_STUDENTS,
		}, format='json')
		self.client.credentials()

		data = {
			'password': 'strangeness-pw',
			'results': [{'system': CollisionSystem.PP, 'signal': 59, 'signalError': 8, 'nEvents': 1000}],
		}

		response = self.client.put('/api/v1/jpsi_analysis/0/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

	def test_nevents_required_for_track_systems(self):
		data = {
			'password': self.PASSWORD,
			'results': [{'system': CollisionSystem.PP, 'signal': 59, 'signalError': 8}],
		}

		response = self.client.put('/api/v1/jpsi_analysis/0/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(JpsiAnalysisResult.objects.count(), 0)

	def test_nevents_forbidden_for_pbpb(self):
		data = {
			'password': self.PASSWORD,
			'results': [{'system': CollisionSystem.PBPB_0_5, 'signal': 34662, 'signalError': 186, 'nEvents': 40090000}],
		}

		response = self.client.put('/api/v1/jpsi_analysis/0/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(JpsiAnalysisResult.objects.count(), 0)

	def test_duplicate_system_in_payload(self):
		data = {
			'password': self.PASSWORD,
			'results': [
				{'system': CollisionSystem.PP, 'signal': 59, 'signalError': 8, 'nEvents': 1000},
				{'system': CollisionSystem.PP, 'signal': 60, 'signalError': 8, 'nEvents': 1000},
			],
		}

		response = self.client.put('/api/v1/jpsi_analysis/0/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(JpsiAnalysisResult.objects.count(), 0)

	def test_create_result(self):
		student = 0

		data = {
			'password': self.PASSWORD,
			'results': [
				{'system': CollisionSystem.PP, 'signal': 59, 'signalError': 8, 'nEvents': 1000},
				{'system': CollisionSystem.PPB, 'signal': 34, 'signalError': 6, 'nEvents': 800},
				{'system': CollisionSystem.PBPB_0_5, 'signal': 34662, 'signalError': 186},
			],
		}

		response = self.client.put(f'/api/v1/jpsi_analysis/{student}/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_200_OK)

		self.assertEqual(JpsiAnalysisResult.objects.count(), 1)
		self.assertEqual(JpsiAnalysisResult.objects.get().student, student)
		self.assertEqual(JpsiAnalysisResultEntry.objects.count(), 3)

		pp_entry = JpsiAnalysisResultEntry.objects.get(system=CollisionSystem.PP)
		self.assertEqual(pp_entry.signal, 59)
		self.assertEqual(pp_entry.nEvents, 1000)

		pbpb_entry = JpsiAnalysisResultEntry.objects.get(system=CollisionSystem.PBPB_0_5)
		self.assertIsNone(pbpb_entry.nEvents)

	def test_resubmit_replaces_previous_entries(self):
		student = 0

		data1 = {
			'password': self.PASSWORD,
			'results': [{'system': CollisionSystem.PP, 'signal': 59, 'signalError': 8, 'nEvents': 1000}],
		}
		response = self.client.put(f'/api/v1/jpsi_analysis/{student}/', data1, format='json')
		self.assertEqual(response.status_code, status.HTTP_200_OK)

		data2 = {
			'password': self.PASSWORD,
			'results': [{'system': CollisionSystem.PPB, 'signal': 34, 'signalError': 6, 'nEvents': 800}],
		}
		response = self.client.put(f'/api/v1/jpsi_analysis/{student}/', data2, format='json')
		self.assertEqual(response.status_code, status.HTTP_200_OK)

		self.assertEqual(JpsiAnalysisResult.objects.count(), 1)
		self.assertEqual(JpsiAnalysisResultEntry.objects.count(), 1)
		self.assertEqual(JpsiAnalysisResultEntry.objects.get().system, CollisionSystem.PPB)


class GetJpsiAnalysisResultsAPITestCase(APITestCase):
	EVENT_NAME = 'JPSI_TEST'
	NAME = 'JPSI_TEST'
	MAX_STUDENTS = 15
	PASSWORD = 'test'

	def setUp(self):
		user = User.objects.create_user('testuser', 'test@test.com', 'test')
		user.save()
		token, _ = Token.objects.get_or_create(user=user)

		self.tokenKey = token.key
		self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.tokenKey)

		self.client.post('/api/v1/events/', {'name': self.EVENT_NAME, 'kind': ExerciseKind.JPSI}, format='json')

		self.client.post('/api/v1/sessions/', {
			'event': self.EVENT_NAME,
			'name': self.NAME,
			'password': self.PASSWORD,
			'maxStudents': self.MAX_STUDENTS,
		}, format='json')

		self.client.credentials()

		self.client.put('/api/v1/jpsi_analysis/0/', {
			'password': self.PASSWORD,
			'results': [
				{'system': CollisionSystem.PP, 'signal': 59, 'signalError': 8, 'nEvents': 1000},
				{'system': CollisionSystem.PBPB_0_5, 'signal': 34662, 'signalError': 186},
			],
		}, format='json')

		# Student 5 (not 1): with the "accept both 0-based and 1-based" numbering also used by
		# the strangeness endpoints, student=1 aliases to the same student_idx=0 as student=0.
		self.client.put('/api/v1/jpsi_analysis/5/', {
			'password': self.PASSWORD,
			'results': [
				{'system': CollisionSystem.PP, 'signal': 65, 'signalError': 9, 'nEvents': 1000},
				{'system': CollisionSystem.PBPB_0_5, 'signal': 35000, 'signalError': 190},
			],
		}, format='json')

	def test_get_results(self):
		self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.tokenKey)

		response = self.client.get('/api/v1/events/')
		event_id = response.data[0]['id']

		response = self.client.get(f'/api/v1/jpsi_analysis_results/{event_id}/', format='json')
		self.assertEqual(response.status_code, status.HTTP_200_OK)

		bySystem = {entry['system']: entry for entry in response.data}

		self.assertEqual(sorted(bySystem[CollisionSystem.PP]['signal']), [59, 65])
		self.assertEqual(sorted(bySystem[CollisionSystem.PP]['nEvents']), [1000, 1000])
		self.assertEqual(sorted(bySystem[CollisionSystem.PBPB_0_5]['signal']), [34662, 35000])
		self.assertEqual(bySystem[CollisionSystem.PBPB_0_5]['nEvents'], [])

	def test_wrong_kind_forbidden(self):
		self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.tokenKey)
		self.client.post('/api/v1/events/', {'name': 'STRANGENESS_TEST'}, format='json')

		response = self.client.get('/api/v1/events/')
		strangeness_event_id = next(e['id'] for e in response.data if e['name'] == 'STRANGENESS_TEST')

		response = self.client.get(f'/api/v1/jpsi_analysis_results/{strangeness_event_id}/', format='json')
		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

	def test_not_found(self):
		self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.tokenKey)

		response = self.client.get('/api/v1/jpsi_analysis_results/999999/', format='json')
		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
