import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { authAPI } from '../services/api';
import { getAuthToken } from '../services/auth';

const { width, height } = Dimensions.get('window');

const HomeScreen = ({ navigation }) => {
  const [mood, setMood] = useState(null);
  const [stressLevel, setStressLevel] = useState(0);
  const [loading, setLoading] = useState(true);
  const [todayCheckIn, setTodayCheckIn] = useState(false);

  const moods = [
    { emoji: 'very-happy', label: 'Great', color: '#4CAF50' },
    { emoji: 'happy', label: 'Good', color: '#8BC34A' },
    { emoji: 'neutral', label: 'Okay', color: '#FFC107' },
    { emoji: 'sad', label: 'Down', color: '#FF9800' },
    { emoji: 'very-sad', label: 'Struggling', color: '#F44336' },
  ];

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const token = await getAuthToken();
      if (token) {
        // Load today's mood check-in
        // Load stress level from backend
        // Load wellness summary
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMoodCheckIn = async (selectedMood) => {
    try {
      setMood(selectedMood);
      setTodayCheckIn(true);
      
      // Save mood to backend
      const token = await getAuthToken();
      if (token) {
        // API call to save mood
        console.log('Mood saved:', selectedMood);
      }
      
      Alert.alert('Thank you!', 'Your mood has been recorded. How are you feeling today?');
    } catch (error) {
      console.error('Error saving mood:', error);
      Alert.alert('Error', 'Could not save your mood. Please try again.');
    }
  };

  const handleEmergencyPress = () => {
    Alert.alert(
      'Emergency Support',
      'If you are in immediate danger, please call emergency services.\n\nWould you like to see crisis resources?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Show Resources', onPress: () => navigation.navigate('Emergency') },
      ]
    );
  };

  const handleBreathingExercise = () => {
    navigation.navigate('Breathing');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6B46C1" />
        <Text style={styles.loadingText}>Loading your wellness data...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <LinearGradient
        colors={['#6B46C1', '#9333EA']}
        style={styles.header}
      >
        <Text style={styles.greeting}>Good Morning!</Text>
        <Text style={styles.subtitle}>How are you feeling today?</Text>
      </LinearGradient>

      {/* Mood Check-in */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Daily Check-in</Text>
        {todayCheckIn ? (
          <View style={styles.checkedInContainer}>
            <Text style={styles.checkedInText}>Thanks for checking in today!</Text>
            <Text style={styles.moodText}>You're feeling: {mood?.label}</Text>
          </View>
        ) : (
          <View style={styles.moodContainer}>
            <Text style={styles.moodQuestion}>How are you feeling?</Text>
            <View style={styles.moodButtons}>
              {moods.map((moodOption) => (
                <TouchableOpacity
                  key={moodOption.emoji}
                  style={[styles.moodButton, { borderColor: moodOption.color }]}
                  onPress={() => handleMoodCheckIn(moodOption)}
                >
                  <Text style={styles.moodEmoji}>{moodOption.emoji}</Text>
                  <Text style={[styles.moodLabel, { color: moodOption.color }]}>
                    {moodOption.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* Stress Level */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Current Stress Level</Text>
        <View style={styles.stressContainer}>
          <View style={styles.stressBar}>
            <View style={[styles.stressFill, { width: `${stressLevel * 100}%` }]} />
          </View>
          <Text style={styles.stressText}>
            {stressLevel < 0.3 ? 'Low' : stressLevel < 0.7 ? 'Moderate' : 'High'} Stress
          </Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionGrid}>
          <TouchableOpacity
            style={[styles.actionButton, styles.chatButton]}
            onPress={() => navigation.navigate('Chat')}
          >
            <Text style={styles.actionEmoji}>Chat</Text>
            <Text style={styles.actionText}>Talk to AI</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.actionButton, styles.breathingButton]}
            onPress={handleBreathingExercise}
          >
            <Text style={styles.actionEmoji}>Breath</Text>
            <Text style={styles.actionText}>Relax</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.actionButton, styles.emergencyButton]}
            onPress={handleEmergencyPress}
          >
            <Text style={styles.actionEmoji}>SOS</Text>
            <Text style={styles.actionText}>Help</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.actionButton, styles.analyticsButton]}
            onPress={() => navigation.navigate('Analytics')}
          >
            <Text style={styles.actionEmoji}>Stats</Text>
            <Text style={styles.actionText}>Progress</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Wellness Summary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Today's Summary</Text>
        <View style={styles.summaryContainer}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>5</Text>
            <Text style={styles.summaryLabel}>Check-ins</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>12</Text>
            <Text style={styles.summaryLabel}>Chat Sessions</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>3</Text>
            <Text style={styles.summaryLabel}>Breathing Exercises</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
    fontFamily: 'System',
  },
  header: {
    padding: 24,
    paddingTop: 60,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  greeting: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  section: {
    margin: 16,
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  moodContainer: {
    alignItems: 'center',
  },
  moodQuestion: {
    fontSize: 16,
    color: '#4B5563',
    marginBottom: 16,
    textAlign: 'center',
  },
  moodButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  moodButton: {
    width: 80,
    height: 80,
    margin: 8,
    borderRadius: 16,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  moodEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  moodLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  checkedInContainer: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(107, 70, 193, 0.1)',
    borderRadius: 16,
  },
  checkedInText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
    marginBottom: 8,
  },
  moodText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  stressContainer: {
    alignItems: 'center',
  },
  stressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    marginBottom: 12,
  },
  stressFill: {
    height: '100%',
    backgroundColor: '#EF4444',
    borderRadius: 4,
  },
  stressText: {
    fontSize: 14,
    color: '#6B7280',
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  actionButton: {
    width: '48%',
    height: 100,
    marginBottom: 12,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  chatButton: {
    backgroundColor: '#6B46C1',
  },
  breathingButton: {
    backgroundColor: '#059669',
  },
  emergencyButton: {
    backgroundColor: '#DC2626',
  },
  analyticsButton: {
    backgroundColor: '#2563EB',
  },
  actionEmoji: {
    fontSize: 24,
    color: 'white',
    marginBottom: 8,
  },
  actionText: {
    fontSize: 14,
    color: 'white',
    fontWeight: '600',
  },
  summaryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#6B46C1',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
});

export default HomeScreen;
