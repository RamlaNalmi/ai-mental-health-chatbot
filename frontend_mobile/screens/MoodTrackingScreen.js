import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, Button, Card } from 'react-native-elements';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/api';

const { width: screenWidth } = Dimensions.get('window');

const MoodTrackingScreen = ({ navigation }) => {
  const [selectedMood, setSelectedMood] = useState(null);
  const [selectedIntensity, setSelectedIntensity] = useState(5);
  const [triggers, setTriggers] = useState([]);
  const [activities, setActivities] = useState([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [recentMoods, setRecentMoods] = useState([]);

  const moods = [
    { name: 'Happy', icon: 'sentiment-very-satisfied', color: '#FFD700' },
    { name: 'Calm', icon: 'sentiment-satisfied', color: '#87CEEB' },
    { name: 'Anxious', icon: 'sentiment-neutral', color: '#DDA0DD' },
    { name: 'Stressed', icon: 'sentiment-dissatisfied', color: '#FF6B6B' },
    { name: 'Sad', icon: 'sentiment-very-dissatisfied', color: '#708090' },
    { name: 'Angry', icon: 'mood-bad', color: '#DC143C' },
  ];

  const commonTriggers = [
    'Academic pressure', 'Social situations', 'Financial stress', 'Family issues',
    'Relationship problems', 'Health concerns', 'Work overload', 'Sleep issues',
    'Uncertainty about future', 'Loneliness', 'Time management', 'Perfectionism'
  ];

  const commonActivities = [
    'Studying', 'Exercising', 'Socializing', 'Working', 'Relaxing',
    'Sleeping', 'Eating', 'Commuting', 'Online classes', 'Hobbies', 'Chores'
  ];

  useEffect(() => {
    loadRecentMoods();
  }, []);

  const loadRecentMoods = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      const response = await api.get('/analytics/mood-recent', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRecentMoods(response.data);
    } catch (error) {
      console.error('Failed to load recent moods:', error);
    }
  };

  const toggleTrigger = (trigger) => {
    setTriggers(prev => 
      prev.includes(trigger) 
        ? prev.filter(t => t !== trigger)
        : [...prev, trigger]
    );
  };

  const toggleActivity = (activity) => {
    setActivities(prev => 
      prev.includes(activity) 
        ? prev.filter(a => a !== activity)
        : [...prev, activity]
    );
  };

  const saveMoodEntry = async () => {
    if (!selectedMood) {
      Alert.alert('Missing Information', 'Please select your current mood');
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('authToken');
      const response = await api.post('/analytics/mood-entry', {
        mood: selectedMood.name,
        intensity: selectedIntensity,
        triggers: triggers.join(', '),
        activities: activities.join(', '),
        notes: notes,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      Alert.alert(
        'Mood Recorded',
        'Your mood has been successfully recorded. Keep up the great work with your mental wellness tracking!',
        [{ text: 'OK', onPress: () => navigation.navigate('Analytics') }]
      );

      // Reset form
      setSelectedMood(null);
      setSelectedIntensity(5);
      setTriggers([]);
      setActivities([]);
      setNotes('');
      
      // Reload recent moods
      loadRecentMoods();
    } catch (error) {
      console.error('Failed to save mood entry:', error);
      Alert.alert('Error', 'Failed to save mood entry');
    } finally {
      setLoading(false);
    }
  };

  const renderMoodSelector = () => (
    <Card containerStyle={styles.moodCard}>
      <Text style={styles.sectionTitle}>How are you feeling right now?</Text>
      <View style={styles.moodGrid}>
        {moods.map((mood) => (
          <TouchableOpacity
            key={mood.name}
            style={[
              styles.moodItem,
              selectedMood?.name === mood.name && styles.selectedMoodItem,
              { borderColor: mood.color }
            ]}
            onPress={() => setSelectedMood(mood)}
          >
            <Icon
              name={mood.icon}
              type="material"
              color={selectedMood?.name === mood.name ? mood.color : '#999'}
              size={30}
            />
            <Text style={[
              styles.moodText,
              selectedMood?.name === mood.name && { color: mood.color }
            ]}>
              {mood.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </Card>
  );

  const renderIntensitySelector = () => (
    <Card containerStyle={styles.intensityCard}>
      <Text style={styles.sectionTitle}>How intense is this feeling?</Text>
      <View style={styles.intensityContainer}>
        <View style={styles.intensityScale}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
            <TouchableOpacity
              key={value}
              style={[
                styles.intensityDot,
                selectedIntensity === value && styles.selectedIntensityDot,
                value <= selectedIntensity && styles.filledIntensityDot
              ]}
              onPress={() => setSelectedIntensity(value)}
            />
          ))}
        </View>
        <View style={styles.intensityLabels}>
          <Text style={styles.intensityLabel}>Low</Text>
          <Text style={styles.intensityValue}>{selectedIntensity}/10</Text>
          <Text style={styles.intensityLabel}>High</Text>
        </View>
      </View>
    </Card>
  );

  const renderTriggersSelector = () => (
    <Card containerStyle={styles.triggersCard}>
      <Text style={styles.sectionTitle}>What might be causing this mood?</Text>
      <View style={styles.chipsContainer}>
        {commonTriggers.map((trigger) => (
          <TouchableOpacity
            key={trigger}
            style={[
              styles.chip,
              triggers.includes(trigger) && styles.selectedChip
            ]}
            onPress={() => toggleTrigger(trigger)}
          >
            <Text style={[
              styles.chipText,
              triggers.includes(trigger) && styles.selectedChipText
            ]}>
              {trigger}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </Card>
  );

  const renderActivitiesSelector = () => (
    <Card containerStyle={styles.activitiesCard}>
      <Text style={styles.sectionTitle}>What were you doing?</Text>
      <View style={styles.chipsContainer}>
        {commonActivities.map((activity) => (
          <TouchableOpacity
            key={activity}
            style={[
              styles.chip,
              activities.includes(activity) && styles.selectedChip
            ]}
            onPress={() => toggleActivity(activity)}
          >
            <Text style={[
              styles.chipText,
              activities.includes(activity) && styles.selectedChipText
            ]}>
              {activity}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </Card>
  );

  const renderNotesSection = () => (
    <Card containerStyle={styles.notesCard}>
      <Text style={styles.sectionTitle}>Additional notes (optional)</Text>
      <TextInput
        style={styles.notesInput}
        value={notes}
        onChangeText={setNotes}
        placeholder="Add any additional thoughts or context..."
        placeholderTextColor="#999"
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />
    </Card>
  );

  const renderRecentMoods = () => (
    <Card containerStyle={styles.recentCard}>
      <View style={styles.recentHeader}>
        <Icon name="history" type="material" color="#667eea" size={20} />
        <Text style={styles.sectionTitle}>Recent Mood Entries</Text>
      </View>
      
      {recentMoods.length > 0 ? (
        recentMoods.slice(0, 5).map((entry, index) => (
          <View key={entry.id} style={styles.recentEntry}>
            <View style={styles.recentMood}>
              <Icon
                name={moods.find(m => m.name === entry.mood)?.icon || 'sentiment-neutral'}
                type="material"
                color={moods.find(m => m.name === entry.mood)?.color || '#999'}
                size={20}
              />
              <Text style={styles.recentMoodText}>{entry.mood}</Text>
              <Text style={styles.recentIntensity}>{entry.intensity}/10</Text>
            </View>
            <Text style={styles.recentDate}>
              {new Date(entry.created_at).toLocaleDateString()}
            </Text>
          </View>
        ))
      ) : (
        <Text style={styles.noRecentText}>No recent mood entries. Start tracking to see your patterns!</Text>
      )}
    </Card>
  );

  return (
    <LinearGradient
      colors={['#f5f7fa', '#c3cfe2']}
      style={styles.container}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" type="material" color="#fff" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mood Tracking</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Analytics')}>
          <Icon name="bar-chart" type="material" color="#fff" size={24} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {renderMoodSelector()}
        {renderIntensitySelector()}
        {renderTriggersSelector()}
        {renderActivitiesSelector()}
        {renderNotesSection()}
        {renderRecentMoods()}

        <View style={styles.saveContainer}>
          <Button
            title="Save Mood Entry"
            onPress={saveMoodEntry}
            loading={loading}
            disabled={!selectedMood || loading}
            buttonStyle={styles.saveButton}
            titleStyle={styles.saveButtonText}
          />
        </View>
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  moodCard: {
    borderRadius: 15,
    marginBottom: 20,
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  moodItem: {
    width: (screenWidth - 60) / 3,
    alignItems: 'center',
    padding: 15,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  selectedMoodItem: {
    backgroundColor: '#f8f9ff',
    borderWidth: 3,
  },
  moodText: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '500',
  },
  intensityCard: {
    borderRadius: 15,
    marginBottom: 20,
    elevation: 4,
  },
  intensityContainer: {
    alignItems: 'center',
  },
  intensityScale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: screenWidth - 60,
    marginBottom: 10,
  },
  intensityDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#e0e0e0',
    borderWidth: 2,
    borderColor: '#ccc',
  },
  selectedIntensityDot: {
    borderWidth: 3,
    borderColor: '#667eea',
  },
  filledIntensityDot: {
    backgroundColor: '#667eea',
  },
  intensityLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: screenWidth - 60,
  },
  intensityLabel: {
    fontSize: 12,
    color: '#666',
  },
  intensityValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#667eea',
  },
  triggersCard: {
    borderRadius: 15,
    marginBottom: 20,
    elevation: 4,
  },
  activitiesCard: {
    borderRadius: 15,
    marginBottom: 20,
    elevation: 4,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    marginRight: 8,
    marginBottom: 8,
  },
  selectedChip: {
    backgroundColor: '#667eea',
    borderColor: '#667eea',
  },
  chipText: {
    fontSize: 12,
    color: '#666',
  },
  selectedChipText: {
    color: '#fff',
  },
  notesCard: {
    borderRadius: 15,
    marginBottom: 20,
    elevation: 4,
  },
  notesInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  recentCard: {
    borderRadius: 15,
    marginBottom: 20,
    elevation: 4,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  recentEntry: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  recentMood: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recentMoodText: {
    fontSize: 14,
    color: '#333',
    marginLeft: 8,
    fontWeight: '500',
  },
  recentIntensity: {
    fontSize: 12,
    color: '#666',
    marginLeft: 8,
  },
  recentDate: {
    fontSize: 12,
    color: '#999',
  },
  noRecentText: {
    textAlign: 'center',
    color: '#999',
    fontStyle: 'italic',
    paddingVertical: 20,
  },
  saveContainer: {
    paddingVertical: 20,
    paddingBottom: 40,
  },
  saveButton: {
    backgroundColor: '#667eea',
    borderRadius: 25,
    paddingVertical: 15,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default MoodTrackingScreen;
