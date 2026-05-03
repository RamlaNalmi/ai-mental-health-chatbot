import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit';
import { LinearGradient } from 'expo-linear-gradient';
import { Card, Button, Icon } from 'react-native-elements';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/api';

const { width: screenWidth } = Dimensions.get('window');

const AnalyticsScreen = ({ navigation }) => {
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('week');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('authToken');
      const response = await api.get('/analytics/dashboard', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDashboardData(response.data);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const getStressColor = (level) => {
    if (level < 0.3) return '#4CAF50'; // Green - Low
    if (level < 0.6) return '#FF9800'; // Orange - Medium
    return '#F44336'; // Red - High
  };

  const getStressLabel = (level) => {
    if (level < 0.3) return 'Low';
    if (level < 0.6) return 'Medium';
    return 'High';
  };

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'improving':
        return 'trending-down';
      case 'worsening':
        return 'trending-up';
      default:
        return 'trending-flat';
    }
  };

  const getTrendColor = (trend) => {
    switch (trend) {
      case 'improving':
        return '#4CAF50';
      case 'worsening':
        return '#F44336';
      default:
        return '#FF9800';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.gradient}
        >
          <Text style={styles.loadingText}>Loading your wellness data...</Text>
        </LinearGradient>
      </View>
    );
  }

  if (!dashboardData) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Unable to load analytics</Text>
        <Button title="Retry" onPress={loadDashboardData} />
      </View>
    );
  }

  const { weekly, monthly, insights, recent_stress, recent_cognitive, summary } = dashboardData;

  // Prepare chart data
  const stressChartData = {
    labels: recent_stress.map((_, index) => `Day ${index + 1}`),
    datasets: [{
      data: recent_stress.map(s => s.stress_level * 100),
      color: (opacity = 1) => `rgba(102, 126, 234, ${opacity})`,
      strokeWidth: 2,
    }],
  };

  const cognitiveChartData = {
    labels: recent_cognitive.map((_, index) => `Day ${index + 1}`),
    datasets: [{
      data: recent_cognitive.map(c => c.cognitive_load * 100),
      color: (opacity = 1) => `rgba(118, 75, 162, ${opacity})`,
      strokeWidth: 2,
    }],
  };

  const sessionTypeData = [
    {
      name: 'Voice',
      population: weekly.voice_sessions,
      color: '#667eea',
      legendFontColor: '#333',
      legendFontSize: 12,
    },
    {
      name: 'Text',
      population: weekly.text_sessions,
      color: '#764ba2',
      legendFontColor: '#333',
      legendFontSize: 12,
    },
  ];

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <LinearGradient
        colors={['#667eea', '#764ba2', '#f093fb']}
        style={styles.headerGradient}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Your Wellness Dashboard</Text>
          <Text style={styles.headerSubtitle}>Track your mental health journey</Text>
        </View>
      </LinearGradient>

      {/* Summary Cards */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryRow}>
          <Card containerStyle={[styles.summaryCard, { borderLeftColor: getStressColor(summary.current_week_stress) }]}>
            <View style={styles.summaryCardContent}>
              <Text style={styles.summaryLabel}>Current Stress</Text>
              <Text style={[styles.summaryValue, { color: getStressColor(summary.current_week_stress) }]}>
                {getStressLabel(summary.current_week_stress)}
              </Text>
              <Text style={styles.summarySubtext}>
                {(summary.current_week_stress * 100).toFixed(1)}%
              </Text>
            </View>
          </Card>

          <Card containerStyle={[styles.summaryCard, { borderLeftColor: getTrendColor(summary.stress_trend) }]}>
            <View style={styles.summaryCardContent}>
              <Text style={styles.summaryLabel}>Trend</Text>
              <Icon
                name={getTrendIcon(summary.stress_trend)}
                type="material"
                color={getTrendColor(summary.stress_trend)}
                size={24}
              />
              <Text style={styles.summarySubtext}>{summary.stress_trend}</Text>
            </View>
          </Card>
        </View>

        <View style={styles.summaryRow}>
          <Card containerStyle={[styles.summaryCard, { borderLeftColor: '#667eea' }]}>
            <View style={styles.summaryCardContent}>
              <Text style={styles.summaryLabel}>Sessions This Week</Text>
              <Text style={styles.summaryValue}>{summary.total_sessions_this_week}</Text>
              <Text style={styles.summarySubtext}>
                {summary.voice_sessions_this_week} voice
              </Text>
            </View>
          </Card>

          <Card containerStyle={[styles.summaryCard, { borderLeftColor: '#4CAF50' }]}>
            <View style={styles.summaryCardContent}>
              <Text style={styles.summaryLabel}>Improvement</Text>
              <Text style={[styles.summaryValue, { color: '#4CAF50' }]}>
                {summary.improvement_score > 0 ? '+' : ''}{summary.improvement_score.toFixed(1)}%
              </Text>
              <Text style={styles.summarySubtext}>This month</Text>
            </View>
          </Card>
        </View>
      </View>

      {/* Insights Section */}
      <Card containerStyle={styles.insightsCard}>
        <View style={styles.sectionHeader}>
          <Icon name="lightbulb-outline" type="material" color="#667eea" size={24} />
          <Text style={styles.sectionTitle}>Personal Insights</Text>
        </View>
        
        {insights.insights.map((insight, index) => (
          <View key={index} style={styles.insightItem}>
            <Icon name="psychology" type="material" color="#764ba2" size={20} />
            <Text style={styles.insightText}>{insight}</Text>
          </View>
        ))}
        
        <View style={styles.recommendationBox}>
          <Text style={styles.recommendationLabel}>Recommendation:</Text>
          <Text style={styles.recommendationText}>{insights.recommendation}</Text>
        </View>
      </Card>

      {/* Stress Trend Chart */}
      <Card containerStyle={styles.chartCard}>
        <View style={styles.sectionHeader}>
          <Icon name="show-chart" type="material" color="#667eea" size={24} />
          <Text style={styles.sectionTitle}>Stress Trend (Last 7 Days)</Text>
        </View>
        
        <LineChart
          data={stressChartData}
          width={screenWidth - 40}
          height={220}
          chartConfig={{
            backgroundColor: '#ffffff',
            backgroundGradientFrom: '#ffffff',
            backgroundGradientTo: '#ffffff',
            decimalPlaces: 0,
            color: (opacity = 1) => `rgba(102, 126, 234, ${opacity})`,
            labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
            style: { borderRadius: 16 },
            propsForDots: { r: '6', strokeWidth: '2', stroke: '#667eea' },
          }}
          bezier
          style={styles.chart}
        />
      </Card>

      {/* Cognitive Load Chart */}
      <Card containerStyle={styles.chartCard}>
        <View style={styles.sectionHeader}>
          <Icon name="psychology" type="material" color="#764ba2" size={24} />
          <Text style={styles.sectionTitle}>Cognitive Load (Last 7 Days)</Text>
        </View>
        
        <LineChart
          data={cognitiveChartData}
          width={screenWidth - 40}
          height={220}
          chartConfig={{
            backgroundColor: '#ffffff',
            backgroundGradientFrom: '#ffffff',
            backgroundGradientTo: '#ffffff',
            decimalPlaces: 0,
            color: (opacity = 1) => `rgba(118, 75, 162, ${opacity})`,
            labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
            style: { borderRadius: 16 },
            propsForDots: { r: '6', strokeWidth: '2', stroke: '#764ba2' },
          }}
          bezier
          style={styles.chart}
        />
      </Card>

      {/* Session Types */}
      <Card containerStyle={styles.chartCard}>
        <View style={styles.sectionHeader}>
          <Icon name="pie-chart" type="material" color="#667eea" size={24} />
          <Text style={styles.sectionTitle}>Session Types This Week</Text>
        </View>
        
        <PieChart
          data={sessionTypeData}
          width={screenWidth - 40}
          height={220}
          chartConfig={{
            color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
          }}
          accessor="population"
          backgroundColor="transparent"
          paddingLeft="15"
          style={styles.chart}
        />
      </Card>

      {/* Action Buttons */}
      <View style={styles.actionContainer}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('MoodTracking')}
        >
          <Icon name="sentiment-satisfied" type="material" color="#fff" size={24} />
          <Text style={styles.actionButtonText}>Track Mood</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Journal')}
        >
          <Icon name="book" type="material" color="#fff" size={24} />
          <Text style={styles.actionButtonText}>Journal</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Goals')}
        >
          <Icon name="flag" type="material" color="#fff" size={24} />
          <Text style={styles.actionButtonText}>Goals</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '500',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 20,
  },
  headerGradient: {
    paddingTop: 50,
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  header: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
  },
  summaryContainer: {
    paddingHorizontal: 20,
    marginTop: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  summaryCard: {
    flex: 1,
    marginHorizontal: 5,
    borderRadius: 12,
    borderLeftWidth: 4,
    elevation: 3,
  },
  summaryCardContent: {
    alignItems: 'center',
    paddingVertical: 15,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 5,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  summarySubtext: {
    fontSize: 11,
    color: '#888',
  },
  insightsCard: {
    margin: 20,
    borderRadius: 12,
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 10,
  },
  insightItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    paddingHorizontal: 10,
  },
  insightText: {
    flex: 1,
    fontSize: 14,
    color: '#555',
    marginLeft: 10,
    lineHeight: 20,
  },
  recommendationBox: {
    backgroundColor: '#f0f4ff',
    padding: 15,
    borderRadius: 8,
    marginTop: 15,
    marginHorizontal: 10,
  },
  recommendationLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#667eea',
    marginBottom: 5,
  },
  recommendationText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  chartCard: {
    margin: 20,
    borderRadius: 12,
    elevation: 3,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  actionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  actionButton: {
    backgroundColor: '#667eea',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 25,
    alignItems: 'center',
    minWidth: 100,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 5,
  },
});

export default AnalyticsScreen;
