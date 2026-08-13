from rest_framework import serializers
from masterclass.models import Event, Session

class EventSerializer(serializers.ModelSerializer):
    class Meta:
        model = Event
        fields = ['id', 'name', 'kind', 'created']

class SessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Session
        fields = ['id', 'name', 'password', 'created', 'maxStudents']
