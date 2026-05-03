import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

const ActivitiesScreen = ({ navigation }) => {
  const [selectedCategory, setSelectedCategory] = useState('all');

  const categories = [
    { id: 'all', label: 'All', icon: 'grid', color: '#6B46C1' },
    { id: 'mindfulness', label: 'Mindfulness', icon: 'leaf', color: '#059669' },
    { id: 'exercise', label: 'Exercise', icon: 'fitness', color: '#DC2626' },
    { id: 'creativity', label: 'Creativity', icon: 'color-palette', color: '#2563EB' },
    { id: 'social', label: 'Social', icon: 'people', color: '#F59E0B' },
  ];

  const activities = [
    {
      id: 1,
      title: '5-Minute Meditation',
      category: 'mindfulness',
      duration: '5 min',
      difficulty: 'Beginner',
      description: 'Quick mindfulness meditation to reduce stress',
      icon: 'water',
      color: '#059669',
      benefits: ['Reduces anxiety', 'Improves focus', 'Calms mind'],
    },
    {
      id: 2,
      title: 'Gratitude Practice',
      category: 'mindfulness',
      duration: '10 min',
      difficulty: 'Beginner',
      description: 'Write down 3 things you\'re grateful for',
      icon: 'heart',
      color: '#6B46C1',
      benefits: ['Boosts mood', 'Increases positivity', 'Builds resilience'],
    },
    {
      id: 3,
      title: 'Stretching Routine',
      category: 'exercise',
      duration: '15 min',
      difficulty: 'Beginner',
      description: 'Full body stretching to release tension',
      icon: 'body',
      color: '#DC2626',
      benefits: ['Relieves tension', 'Improves flexibility', 'Reduces stress'],
    },
    {
      id: 4,
      title: 'Creative Writing',
      category: 'creativity',
      duration: '20 min',
      difficulty: 'Intermediate',
      description: 'Express yourself through creative writing',
      icon: 'create',
      color: '#2563EB',
      benefits: ['Self-expression', 'Emotional release', 'Creative outlet'],
    },
    {
      id: 5,
      title: 'Progressive Muscle Relaxation',
      category: 'mindfulness',
      duration: '10 min',
      difficulty: 'Beginner',
      description: 'Systematic muscle relaxation technique',
      icon: 'medical',
      color: '#059669',
      benefits: ['Deep relaxation', 'Body awareness', 'Stress relief'],
    },
    {
      id: 6,
      title: 'Walking Meditation',
      category: 'exercise',
      duration: '15 min',
      difficulty: 'Beginner',
      description: 'Mindful walking exercise',
      icon: 'walk',
      color: '#DC2626',
      benefits: ['Physical activity', 'Mindfulness', 'Fresh air'],
    },
    {
      id: 7,
      title: 'Drawing/Doodling',
      category: 'creativity',
      duration: '15 min',
      difficulty: 'Beginner',
      description: 'Express emotions through art',
      icon: 'brush',
      color: '#2563EB',
      benefits: ['Creative expression', 'Stress relief', 'Mindfulness'],
    },
    {
      id: 8,
      title: 'Connect with Friend',
      category: 'social',
      duration: '20 min',
      difficulty: 'Beginner',
      description: 'Reach out to someone you trust',
      icon: 'call',
      color: '#F59E0B',
      benefits: ['Social support', 'Connection', 'Emotional sharing'],
    },
  ];

  const filteredActivities = selectedCategory === 'all' 
    ? activities 
    : activities.filter(activity => activity.category === selectedCategory);

  const getDifficultyColor = (difficulty) => {
    switch (difficulty) {
      case 'Beginner': return '#4CAF50';
      case 'Intermediate': return '#FFC107';
      case 'Advanced': return '#F44336';
      default: return '#9CA3AF';
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['#2563EB', '#1E88E5']}
        style={styles.header}
      >
        <Text style={styles.title}>Wellness Activities</Text>
        <Text style={styles.subtitle}>Choose activities that support your mental health</Text>
      </LinearGradient>

      {/* Category Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryContainer}
        contentContainerStyle={styles.categoryContent}
      >
        {categories.map((category) => (
          <TouchableOpacity
            key={category.id}
            style={[
              styles.categoryTab,
              selectedCategory === category.id && {
                backgroundColor: category.color,
              }
            ]}
            onPress={() => setSelectedCategory(category.id)}
          >
            <Ionicons
              name={category.icon}
              size={20}
              color={selectedCategory === category.id ? 'white' : category.color}
            />
            <Text style={[
              styles.categoryText,
              selectedCategory === category.id && { color: 'white' }
            ]}>
              {category.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Activities Grid */}
      <ScrollView style={styles.activitiesContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.activitiesGrid}>
          {filteredActivities.map((activity) => (
            <TouchableOpacity
              key={activity.id}
              style={styles.activityCard}
              onPress={() => {
                // Navigate to activity details
                Alert.alert(
                  activity.title,
                  `Duration: ${activity.duration}\nDifficulty: ${activity.difficulty}\n\nWould you like to start this activity?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Start', onPress: () => console.log('Starting:', activity.title) }
                  ]
                );
              }}
            >
              <LinearGradient
                colors={[activity.color, `${activity.color}CC`]}
                style={styles.activityHeader}
              >
                <Ionicons name={activity.icon} size={32} color="white" />
                <View style={styles.activityMeta}>
                  <Text style={styles.activityDuration}>{activity.duration}</Text>
                  <View style={[
                    styles.difficultyBadge,
                    { backgroundColor: getDifficultyColor(activity.difficulty) }
                  ]}>
                    <Text style={styles.difficultyText}>{activity.difficulty}</Text>
                  </View>
                </View>
              </LinearGradient>
              
              <View style={styles.activityContent}>
                <Text style={styles.activityTitle}>{activity.title}</Text>
                <Text style={styles.activityDescription}>{activity.description}</Text>
                
                <View style={styles.benefitsContainer}>
                  <Text style={styles.benefitsTitle}>Benefits:</Text>
                  {activity.benefits.map((benefit, index) => (
                    <View key={index} style={styles.benefitItem}>
                      <Ionicons name="checkmark-circle" size={14} color="#059669" />
                      <Text style={styles.benefitText}>{benefit}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
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
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
  },
  categoryContainer: {
    padding: 16,
    marginBottom: 8,
  },
  categoryContent: {
    paddingRight: 16,
  },
  categoryTab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginLeft: 6,
  },
  activitiesContainer: {
    flex: 1,
    padding: 16,
  },
  activitiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  activityCard: {
    width: '48%',
    backgroundColor: 'white',
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  activityHeader: {
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activityMeta: {
    alignItems: 'flex-end',
  },
  activityDuration: {
    fontSize: 12,
    color: 'white',
    fontWeight: '600',
    marginBottom: 4,
  },
  difficultyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  difficultyText: {
    fontSize: 10,
    color: 'white',
    fontWeight: '600',
  },
  activityContent: {
    padding: 16,
  },
  activityTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  activityDescription: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
    marginBottom: 12,
  },
  benefitsContainer: {
    marginTop: 8,
  },
  benefitsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 6,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  benefitText: {
    fontSize: 10,
    color: '#6B7280',
    marginLeft: 4,
    flex: 1,
  },
});

export default ActivitiesScreen;
