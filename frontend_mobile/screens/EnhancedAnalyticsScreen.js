import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { LineChart } from 'react-native-chart-kit';

const { width } = Dimensions.get('window');

const EnhancedAnalyticsScreen = ({ navigation }) => {
  const [selectedPeriod, setSelectedPeriod] = useState('week');
  const [moodData, setMoodData] = useState([
    { day: 'Mon', mood: 'happy', stress: 0.3 },
    { day: 'Tue', mood: 'neutral', stress: 0.5 },
    { day: 'Wed', mood: 'sad', stress: 0.7 },
    { day: 'Thu', mood: 'happy', stress: 0.2 },
    { day: 'Fri', mood: 'neutral', stress: 0.4 },
    { day: 'Sat', mood: 'happy', stress: 0.1 },
    { day: 'Sun', mood: 'sad', stress: 0.6 },
  ]);

  const [stats, setStats] = useState({
    avgStress: 0.4,
    totalCheckIns: 12,
    chatSessions: 8,
    breathingExercises: 3,
    streakDays: 5,
  });

  const periods = [
    { label: 'Day', value: 'day' },
    { label: 'Week', value: 'week' },
    { label: 'Month', value: 'month' },
  ];

  const getStressColor = (level) => {
    if (level < 0.3) return '#4CAF50';
    if (level < 0.6) return '#FFC107';
    return '#FF9800';
  };

  const getMoodEmoji = (mood) => {
    const emojis = {
      happy: '😊',
      neutral: '😐',
      sad: '😔',
      very_happy: '😄',
      very_sad: '😢',
    };
    return emojis[mood] || '😐';
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <LinearGradient
        colors={['#2563EB', '#1E88E5']}
        style={styles.header}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Analytics & Insights</Text>
      </LinearGradient>

      {/* Period Selector */}
      <View style={styles.periodContainer}>
        <Text style={styles.sectionTitle}>Time Period</Text>
        <View style={styles.periodButtons}>
          {periods.map((period) => (
            <TouchableOpacity
              key={period.value}
              style={[
                styles.periodButton,
                selectedPeriod === period.value && styles.periodButtonActive
              ]}
              onPress={() => setSelectedPeriod(period.value)}
            >
              <Text style={[
                styles.periodButtonText,
                selectedPeriod === period.value && styles.periodButtonTextActive
              ]}>
                {period.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Mood Trend Chart */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Mood Trends</Text>
        <View style={styles.chartContainer}>
          <LineChart
            data={{
              labels: moodData.map(d => d.day),
              datasets: [{
                data: moodData.map(d => d.stress),
                color: '#6B46C1',
                strokeWidth: 3,
              }]
            }}
            width={width - 40}
            height={200}
            withDots={true}
            withInnerLines={false}
            chartConfig={{
              backgroundColor: 'transparent',
            }}
            style={styles.chart}
          />
        </View>
      </View>

      {/* Mood Distribution */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Mood Distribution</Text>
        <View style={styles.moodDistribution}>
          {moodData.map((day, index) => (
            <View key={index} style={styles.moodItem}>
              <Text style={styles.moodEmoji}>{getMoodEmoji(day.mood)}</Text>
              <View style={styles.moodBar}>
                <View style={[styles.moodFill, { backgroundColor: getStressColor(day.stress) }]} />
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Stats Summary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Progress Summary</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.totalCheckIns}</Text>
            <Text style={styles.statLabel}>Total Check-ins</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.chatSessions}</Text>
            <Text style={styles.statLabel}>Chat Sessions</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.breathingExercises}</Text>
            <Text style={styles.statLabel}>Breathing Exercises</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.streakDays}</Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>
        </View>
      </View>

      {/* Insights */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Personal Insights</Text>
        <View style={styles.insightsContainer}>
          <View style={styles.insightCard}>
            <Text style={styles.insightTitle}>🌅 Best Day</Text>
            <Text style={styles.insightText}>Thursday - Feeling Happy</Text>
          </View>
          <View style={styles.insightCard}>
            <Text style={styles.insightTitle}>💡 Recommendation</Text>
            <Text style={styles.insightText}>Try morning meditation to reduce stress levels</Text>
          </View>
          <View style={styles.insightCard}>
            <Text style={styles.insightTitle}>📈 Trend</Text>
            <Text style={styles.insightText}>Stress levels improving by 15% this week</Text>
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
  header: {
    paddingTop: 60,
    padding: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 20,
    zIndex: 1,
  },
  backText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginBottom: 20,
  },
  periodContainer: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
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
  periodButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  periodButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  periodButtonActive: {
    backgroundColor: '#6B46C1',
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  periodButtonTextActive: {
    color: 'white',
  },
  chartContainer: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  chart: {
    borderRadius: 8,
  },
  moodDistribution: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  moodItem: {
    alignItems: 'center',
    flex: 1,
  },
  moodEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  moodBar: {
    width: 30,
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  moodFill: {
    height: '100%',
    borderRadius: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    width: '48%',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#6B46C1',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  insightsContainer: {
    padding: 16,
  },
  insightCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  insightTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  insightText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
});

export default EnhancedAnalyticsScreen;
