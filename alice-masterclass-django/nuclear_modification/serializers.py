from rest_framework import serializers

from .models import EventExplorationResult, EventExplorationResultsEntry


class EventExplorationResultsEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = EventExplorationResultsEntry
        fields = [
            'eventClass',
            'nColl',
            'multiplicity',
            'multiplicityMinPt',
            'raa',
            'raaMinPt',
        ]


class EventExplorationResultSerializer(serializers.ModelSerializer):
    entries = EventExplorationResultsEntrySerializer(
        many=True, read_only=True, source='eventexplorationresultsentry_set'
    )

    class Meta:
        model = EventExplorationResult
        fields = [
            'student',
            'dataset',
            'ppEvents',
            'meanPpMultiplicity',
            'meanPpMultiplicityMinPt',
            'entries',
        ]
