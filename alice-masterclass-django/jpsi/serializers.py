from rest_framework import serializers

from .models import JpsiAnalysisResultEntry, TRACK_SYSTEMS


class JpsiAnalysisResultEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = JpsiAnalysisResultEntry
        fields = ['system', 'signal', 'signalError', 'nEvents']

    def validate(self, data):
        is_track_system = data.get('system') in TRACK_SYSTEMS
        n_events = data.get('nEvents')

        if is_track_system and n_events is None:
            raise serializers.ValidationError('nEvents is required for pp/p-Pb entries.')
        if not is_track_system and n_events is not None:
            raise serializers.ValidationError('nEvents must not be submitted for Pb-Pb entries.')

        return data
