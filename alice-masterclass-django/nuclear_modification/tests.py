from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token

from .models import EventClass, EventExplorationResult, EventExplorationResultsEntry

SUBMIT_URL = '/api/v1/nuclear_modification_event_exploration'
RESULTS_URL = '/api/v1/nuclear_modification_event_exploration_results'


def classEntry(eventClass, nColl, multiplicity, multiplicityMinPt, raa, raaMinPt):
	return {
		'eventClass': eventClass,
		'nColl': nColl,
		'multiplicity': multiplicity,
		'multiplicityMinPt': multiplicityMinPt,
		'raa': raa,
		'raaMinPt': raaMinPt,
	}


CLASSES = [
	classEntry(EventClass.PBPB_PERIPHERAL, 6.32, 95, 24, 0.71, 0.65),
	classEntry(EventClass.PBPB_SEMI_CENTRAL, 438.8, 1200, 310, 0.22, 0.19),
	classEntry(EventClass.PBPB_CENTRAL, 1686.87, 3400, 900, 0.16, 0.14),
]


class EventExplorationTestBase(APITestCase):
	EVENT_NAME = 'TEST'
	NAME = 'TEST'
	MAX_STUDENTS = 15
	PASSWORD = 'test'

	def createSession(self):
		user = User.objects.create_user('testuser', 'test@test.com', 'test')
		user.save()
		token, _ = Token.objects.get_or_create(user=user)

		self.tokenKey = token.key

		self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.tokenKey)

		self.client.post('/api/v1/events/', {'name': self.EVENT_NAME}, format='json')
		self.client.post('/api/v1/sessions/', {
			'event': self.EVENT_NAME,
			'name': self.NAME,
			'password': self.PASSWORD,
			'maxStudents': self.MAX_STUDENTS,
		}, format='json')

		self.client.credentials()

	def payload(self, classes=None, dataset=0):
		return {
			'password': self.PASSWORD,
			'dataset': dataset,
			'results': {
				'ppEvents': 30,
				'meanPpMultiplicity': 12.5,
				'meanPpMultiplicityMinPt': 3.25,
				'classes': CLASSES if classes is None else classes,
			},
		}


class SubmitEventExplorationResultsAPITestCase(EventExplorationTestBase):
	def setUp(self):
		self.createSession()

	def test_unauthorized(self):
		data = self.payload()
		data['password'] = 'not-test'

		response = self.client.put(f'{SUBMIT_URL}/0/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

	def test_missing_password(self):
		data = self.payload()
		del data['password']

		response = self.client.put(f'{SUBMIT_URL}/0/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_create_malformed_result(self):
		# no 'results' key at all
		response = self.client.put(f'{SUBMIT_URL}/0/', {'password': self.PASSWORD}, format='json')
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

		# 'results' is not an object
		response = self.client.put(f'{SUBMIT_URL}/0/', {'password': self.PASSWORD, 'results': False}, format='json')
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

		# 'classes' is not a list
		data = self.payload()
		data['results']['classes'] = {'eventClass': EventClass.PBPB_CENTRAL}
		response = self.client.put(f'{SUBMIT_URL}/0/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

		# unknown event class
		data = self.payload(classes=[classEntry('bogus', 1.0, 1, 1, 1.0, 1.0)])
		response = self.client.put(f'{SUBMIT_URL}/0/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

		# non-numeric R_AA
		data = self.payload(classes=[classEntry(EventClass.PBPB_CENTRAL, 1.0, 1, 1, 'nope', 1.0)])
		response = self.client.put(f'{SUBMIT_URL}/0/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

		# missing field on a class entry
		data = self.payload(classes=[{'eventClass': EventClass.PBPB_CENTRAL, 'raa': 0.5}])
		response = self.client.put(f'{SUBMIT_URL}/0/', data, format='json')
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

		self.assertEqual(EventExplorationResult.objects.count(), 0)
		self.assertEqual(EventExplorationResultsEntry.objects.count(), 0)

	def test_student_out_of_range(self):
		response = self.client.put(f'{SUBMIT_URL}/{self.MAX_STUDENTS + 1}/', self.payload(), format='json')
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_create_result(self):
		response = self.client.put(f'{SUBMIT_URL}/0/', self.payload(dataset=2), format='json')
		self.assertEqual(response.status_code, status.HTTP_200_OK)

		self.assertEqual(EventExplorationResult.objects.count(), 1)

		result = EventExplorationResult.objects.get()
		self.assertEqual(result.student, 0)
		self.assertEqual(result.dataset, 2)
		self.assertEqual(result.ppEvents, 30)
		self.assertEqual(result.meanPpMultiplicity, 12.5)
		self.assertEqual(result.meanPpMultiplicityMinPt, 3.25)

		self.assertEqual(EventExplorationResultsEntry.objects.count(), 3)

		for c in CLASSES:
			entry = EventExplorationResultsEntry.objects.get(eventClass=c['eventClass'])
			self.assertEqual(entry.nColl, c['nColl'])
			self.assertEqual(entry.multiplicity, c['multiplicity'])
			self.assertEqual(entry.multiplicityMinPt, c['multiplicityMinPt'])
			self.assertEqual(entry.raa, c['raa'])
			self.assertEqual(entry.raaMinPt, c['raaMinPt'])

	def test_partial_result(self):
		"""A student who has only reached the peripheral event may upload just that."""
		response = self.client.put(f'{SUBMIT_URL}/0/', self.payload(classes=CLASSES[:1]), format='json')
		self.assertEqual(response.status_code, status.HTTP_200_OK)

		self.assertEqual(EventExplorationResultsEntry.objects.count(), 1)
		self.assertEqual(
			EventExplorationResultsEntry.objects.get().eventClass,
			EventClass.PBPB_PERIPHERAL,
		)

	def test_resubmit_replaces(self):
		self.client.put(f'{SUBMIT_URL}/0/', self.payload(), format='json')

		updated = [dict(c) for c in CLASSES[:2]]
		updated[0]['raa'] = 0.9

		response = self.client.put(f'{SUBMIT_URL}/0/', self.payload(classes=updated), format='json')
		self.assertEqual(response.status_code, status.HTTP_200_OK)

		self.assertEqual(EventExplorationResult.objects.count(), 1)
		self.assertEqual(EventExplorationResultsEntry.objects.count(), 2)
		self.assertEqual(
			EventExplorationResultsEntry.objects.get(eventClass=EventClass.PBPB_PERIPHERAL).raa,
			0.9,
		)

	def test_one_based_student_numbering(self):
		"""Clients may number students from 1; they are stored 0-based."""
		response = self.client.put(f'{SUBMIT_URL}/{self.MAX_STUDENTS}/', self.payload(), format='json')
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(EventExplorationResult.objects.get().student, self.MAX_STUDENTS - 1)

	def test_malformed_result_leaves_previous_untouched(self):
		self.client.put(f'{SUBMIT_URL}/0/', self.payload(), format='json')

		bad = self.payload(classes=[classEntry('bogus', 1.0, 1, 1, 1.0, 1.0)])
		response = self.client.put(f'{SUBMIT_URL}/0/', bad, format='json')
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

		self.assertEqual(EventExplorationResult.objects.count(), 1)
		self.assertEqual(EventExplorationResultsEntry.objects.count(), 3)


class GetEventExplorationResultsAPITestCase(EventExplorationTestBase):
	def setUp(self):
		self.createSession()

		self.client.put(f'{SUBMIT_URL}/0/', self.payload(dataset=1), format='json')
		# 2 -> stored as student 1 (the 1-based/0-based heuristic in the view).
		self.client.put(f'{SUBMIT_URL}/2/', self.payload(classes=CLASSES[:2], dataset=1), format='json')

	def sessionId(self):
		self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.tokenKey)
		return self.client.get('/api/v1/sessions/').data[0]['id']

	def test_unknown_session(self):
		id = self.sessionId()

		response = self.client.get(f'{RESULTS_URL}/{id + 1000}/', format='json')
		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

	def test_get_results(self):
		id = self.sessionId()

		response = self.client.get(f'{RESULTS_URL}/{id}/', format='json')
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(len(response.data), 2)

		first = response.data[0]
		self.assertEqual(first['student'], 0)
		self.assertEqual(first['dataset'], 1)
		self.assertEqual(first['ppEvents'], 30)
		self.assertEqual(first['meanPpMultiplicity'], 12.5)
		self.assertEqual(first['meanPpMultiplicityMinPt'], 3.25)
		self.assertEqual(len(first['entries']), 3)

		byClass = {e['eventClass']: e for e in first['entries']}
		self.assertEqual(
			set(byClass),
			{EventClass.PBPB_PERIPHERAL, EventClass.PBPB_SEMI_CENTRAL, EventClass.PBPB_CENTRAL},
		)
		self.assertEqual(byClass[EventClass.PBPB_CENTRAL]['raa'], 0.16)
		self.assertEqual(byClass[EventClass.PBPB_CENTRAL]['raaMinPt'], 0.14)
		self.assertEqual(byClass[EventClass.PBPB_CENTRAL]['nColl'], 1686.87)

		second = response.data[1]
		self.assertEqual(second['student'], 1)
		self.assertEqual(len(second['entries']), 2)
