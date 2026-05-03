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

const BeautifulHomeScreen = ({ navigation }) => {
  const [mood, setMood] = useState(null);
  const [stressLevel, setStressLevel] = useState(0);
  const [loading, setLoading] = useState(true);
  const [todayCheckIn, setTodayCheckIn] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  const moods = [
    { emoji: 'very-happy', label: 'Radiant', color: '#4CAF50', gradient: ['#4CAF50', '#8BC34A'] },
    { emoji: 'happy', label: 'Joyful', color: '#8BC34A', gradient: ['#8BC34A', '#CDDC39'] },
    { emoji: 'neutral', label: 'Balanced', color: '#FFC107', gradient: ['#FFC107', '#FF9800'] },
    { emoji: 'sad', label: 'Thoughtful', color: '#FF9800', gradient: ['#FF9800', '#FF5722'] },
    { emoji: 'very-sad', label: 'Reflective', color: '#F44336', gradient: ['#F44336', '#E91E63'] },
  ];

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();
    
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const token = await getAuthToken();
      if (token) {
        // Load user data
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
      
      const token = await getAuthToken();
      if (token) {
        console.log('Mood saved:', selectedMood);
      }
      
      Alert.alert('Thank you! Your mood has been recorded. Take a moment to reflect on how you feel today.');
    } catch (error) {
      console.error('Error saving mood:', error);
      Alert.alert('Error', 'Could not save your mood. Please try again.');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient colors={['#667eea', '#764ba2']} style={styles.loadingGradient}>
          <ActivityIndicator size="large" color="white" />
          <Text style={styles.loadingText}>Preparing your wellness journey...</Text>
        </LinearGradient>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Beautiful Header */}
      <LinearGradient
        colors={['#667eea', '#764ba2', '#f093fb']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Animated.View style={[styles.headerContent, { opacity: fadeAnim }]}>
          <View style={styles.greetingContainer}>
            <Text style={styles.greeting}>Good Morning</Text>
            <Text style={styles.subtitle}>Your wellness journey begins here</Text>
          </View>
          <View style={styles.quoteContainer}>
            <Text style={styles.quote}>"Every moment is a fresh beginning."</Text>
            <Text style={styles.quoteAuthor}>- T.S. Eliot</Text>
          </View>
        </Animated.View>
        
        {/* Floating Elements */}
        <View style={styles.floatingElements}>
          <Animated.View style={[styles.circle, styles.circle1]} />
          <Animated.View style={[styles.circle, styles.circle2]} />
          <Animated.View style={[styles.circle, styles.circle3]} />
        </View>
      </LinearGradient>

      {/* Mood Check-in */}
      <Animated.View style={[styles.section, { transform: [{ translateY: slideAnim }] }]}>
        <LinearGradient
          colors={['#ffffff', '#f8f9fa']}
          style={styles.moodSection}
        >
          <View style={styles.sectionHeader}>
            <Ionicons name="heart" size={24} color="#667eea" />
            <Text style={styles.sectionTitle}>Daily Soul Check</Text>
          </View>
          
          {todayCheckIn ? (
            <View style={styles.checkedInContainer}>
              <LinearGradient
                colors={mood.find(m => m.emoji === mood?.emoji)?.gradient || ['#4CAF50', '#8BC34A']}
                style={styles.checkedInGradient}
              >
                <Text style={styles.checkedInText}>Thank you for checking in today</Text>
                <Text style={styles.moodText}>You're feeling: {mood?.label}</Text>
              </LinearGradient>
            </View>
          ) : (
            <View style={styles.moodContainer}>
              <Text style={styles.moodQuestion}>How is your heart today?</Text>
              <View style={styles.moodGrid}>
                {moods.map((moodOption, index) => (
                  <Animated.View key={index} style={[
                    styles.moodCard,
                    { borderColor: moodOption.color }
                  ]}>
                    <TouchableOpacity
                      style={styles.moodButton}
                      onPress={() => handleMoodCheckIn(moodOption)}
                    >
                      <LinearGradient
                        colors={moodOption.gradient}
                        style={styles.moodGradient}
                      >
                        <Text style={styles.moodEmoji}>{moodOption.emoji}</Text>
                        <Text style={styles.moodLabel}>{moodOption.label}</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </Animated.View>
                ))}
              </View>
            </View>
          )}
        </LinearGradient>
      </Animated.View>

      {/* Wellness Actions */}
      <Animated.View style={[styles.section, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.sectionHeader}>
          <Ionicons name="sparkles" size={24} color="#667eea" />
          <Text style={styles.sectionTitle}>Your Wellness Toolkit</Text>
        </View>
        
        <View style={styles.actionGrid}>
          <TouchableOpacity
            style={[styles.actionCard, styles.chatCard]}
            onPress={() => navigation.navigate('Chat')}
          >
            <LinearGradient colors={['#667eea', '#764ba2']} style={styles.actionGradient}>
              <Ionicons name="chatbubble" size={32} color="white" />
              <Text style={styles.actionTitle}>AI Companion</Text>
              <Text style={styles.actionSubtitle}>Talk to your wellness guide</Text>
            </LinearGradient>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.actionCard, styles.breathingCard]}
            onPress={() => navigation.navigate('Breathing')}
          >
            <LinearGradient colors={['#4CAF50', '#8BC34A']} style={styles.actionGradient}>
              <Ionicons name="leaf" size={32} color="white" />
              <Text style={styles.actionTitle}>Mindful Breathing</Text>
              <Text style={styles.actionSubtitle}>Find your inner peace</Text>
            </LinearGradient>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.actionCard, styles.journalCard]}
            onPress={() => navigation.navigate('Journal')}
          >
            <LinearGradient colors={['#FF9800', '#FF5722']} style={styles.actionGradient}>
              <Ionicons name="book" size={32} color="white" />
              <Text style={styles.actionTitle}>Sacred Journal</Text>
              <Text style={styles.actionSubtitle}>Capture your thoughts</Text>
            </LinearGradient>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.actionCard, styles.emergencyCard]}
            onPress={() => navigation.navigate('Emergency')}
          >
            <LinearGradient colors={['#F44336', '#E91E63']} style={styles.actionGradient}>
              <Ionicons name="shield-checkmark" size={32} color="white" />
              <Text style={styles.actionTitle}>Safe Haven</Text>
              <Text style={styles.actionSubtitle}>Support when needed</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Daily Wisdom */}
      <Animated.View style={[styles.section, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.sectionHeader}>
          <Ionicons name="lightbulb" size={24} color="#667eea" />
          <Text style={styles.sectionTitle}>Daily Wisdom</Text>
        </View>
        
        <LinearGradient
          colors={['#f8f9fa', '#ffffff']}
          style={styles.wisdomCard}
        >
          <Text style={styles.wisdomText}>
            "Your present circumstances don't determine where you can go; they merely determine where you start."
          </Text>
          <Text style={styles.wisdomAuthor}>- Nido Qubein</Text>
        </LinearGradient>
      </Animated.View>
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
  },
  loadingGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    color: 'white',
    fontFamily: 'System',
  },
  header: {
    height: height * 0.4,
    paddingTop: 60,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    position: 'relative',
    overflow: 'hidden',
  },
  headerContent: {
    flex: 1,
    justifyContent: 'center',
  },
  greetingContainer: {
    marginBottom: 30,
  },
  greeting: {
    fontSize: 36,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  quoteContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 20,
    borderRadius: 20,
    backdropFilter: 'blur(10)',
  },
  quote: {
    fontSize: 16,
    color: 'white',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  quoteAuthor: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'right',
  },
  floatingElements: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  circle: {
    position: 'absolute',
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  circle1: {
    width: 100,
    height: 100,
    top: 50,
    right: -30,
  },
  circle2: {
    width: 60,
    height: 60,
    bottom: 80,
    left: -20,
  },
  circle3: {
    width: 80,
    height: 80,
    top: 150,
    left: 20,
  },
  section: {
    margin: 16,
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginLeft: 8,
  },
  moodSection: {
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  moodContainer: {
    alignItems: 'center',
  },
  moodQuestion: {
    fontSize: 18,
    color: '#4B5563',
    marginBottom: 20,
    textAlign: 'center',
    fontWeight: '500',
  },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  moodCard: {
    borderWidth: 2,
    borderRadius: 16,
    overflow: 'hidden',
  },
  moodButton: {
    width: 80,
    height: 80,
  },
  moodGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moodEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  moodLabel: {
    fontSize: 10,
    color: 'white',
    fontWeight: '600',
  },
  checkedInContainer: {
    alignItems: 'center',
  },
  checkedInGradient: {
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
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
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  actionCard: {
    width: '48%',
    height: 120,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  actionGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  actionTitle: {
    fontSize: 14,
    color: 'white',
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 4,
  },
  actionSubtitle: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
  },
  wisdomCard: {
    padding: 20,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  wisdomText: {
    fontSize: 16,
    color: '#4B5563',
    lineHeight: 24,
    marginBottom: 12,
    fontStyle: 'italic',
  },
  wisdomAuthor: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'right',
    fontWeight: '500',
  },
});

export default BeautifulHomeScreen;
