import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, Card, Badge } from 'react-native-elements';

const KnowledgeGraphResponse = ({ kgData, onSymptomPress, onTriggerPress, onCopingPress }) => {
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(30)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  if (!kgData || (!kgData.symptoms?.length && !kgData.triggers?.length && !kgData.coping?.length)) {
    return null;
  }

  const getSymptomColor = (index) => {
    const colors = ['#e74c3c', '#e67e22', '#f39c12', '#f1c40f'];
    return colors[index % colors.length];
  };

  const getTriggerColor = (index) => {
    const colors = ['#9b59b6', '#8e44ad', '#663399', '#5b2c6f'];
    return colors[index % colors.length];
  };

  const getCopingColor = (index) => {
    const colors = ['#27ae60', '#2ecc71', '#16a085', '#1abc9c'];
    return colors[index % colors.length];
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Icon name="psychology" type="material" color="#667eea" size={24} />
        <Text style={styles.headerTitle}>Understanding Your Stress</Text>
        <Text style={styles.headerSubtitle}>Based on our conversation</Text>
      </View>

      {/* Symptoms Section */}
      {kgData.symptoms?.length > 0 && (
        <Card containerStyle={[styles.sectionCard, styles.symptomsCard]}>
          <View style={styles.sectionHeader}>
            <Icon name="healing" type="material" color="#e74c3c" size={20} />
            <Text style={styles.sectionTitle}>Symptoms We've Identified</Text>
          </View>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipsContainer}>
              {kgData.symptoms.map((symptom, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.chip,
                    { backgroundColor: getSymptomColor(index) }
                  ]}
                  onPress={() => onSymptomPress && onSymptomPress(symptom)}
                >
                  <Text style={styles.chipText}>{symptom}</Text>
                  <Icon name="info-outline" type="material" color="#fff" size={16} />
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={styles.sectionDescription}>
            These are common stress indicators you've mentioned. Understanding them is the first step toward managing them effectively.
          </Text>
        </Card>
      )}

      {/* Triggers Section */}
      {kgData.triggers?.length > 0 && (
        <Card containerStyle={[styles.sectionCard, styles.triggersCard]}>
          <View style={styles.sectionHeader}>
            <Icon name="warning" type="material" color="#9b59b6" size={20} />
            <Text style={styles.sectionTitle}>Potential Stress Triggers</Text>
          </View>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipsContainer}>
              {kgData.triggers.map((trigger, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.chip,
                    { backgroundColor: getTriggerColor(index) }
                  ]}
                  onPress={() => onTriggerPress && onTriggerPress(trigger)}
                >
                  <Text style={styles.chipText}>{trigger}</Text>
                  <Icon name="lightbulb-outline" type="material" color="#fff" size={16} />
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={styles.sectionDescription}>
            These factors may be contributing to your stress levels. Let's explore strategies to address them.
          </Text>
        </Card>
      )}

      {/* Coping Mechanisms Section */}
      {kgData.coping?.length > 0 && (
        <Card containerStyle={[styles.sectionCard, styles.copingCard]}>
          <View style={styles.sectionHeader}>
            <Icon name="self-improvement" type="material" color="#27ae60" size={20} />
            <Text style={styles.sectionTitle}>Recommended Coping Strategies</Text>
          </View>
          
          <View style={styles.copingContainer}>
            {kgData.coping.map((strategy, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.copingItem,
                  { borderLeftColor: getCopingColor(index) }
                ]}
                onPress={() => onCopingPress && onCopingPress(strategy)}
              >
                <View style={styles.copingIcon}>
                  <Icon name="check-circle" type="material" color={getCopingColor(index)} size={20} />
                </View>
                <View style={styles.copingContent}>
                  <Text style={styles.copingTitle}>{strategy}</Text>
                  <Text style={styles.copingDescription}>
                    Tap to learn more about this technique
                  </Text>
                </View>
                <Icon name="chevron-right" type="material" color="#999" size={20} />
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionDescription}>
            These evidence-based strategies can help you manage stress more effectively. Try incorporating them into your daily routine.
          </Text>
        </Card>
      )}

      {/* Action Card */}
      <Card containerStyle={styles.actionCard}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.actionGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.actionContent}>
            <Icon name="favorite" type="material" color="#fff" size={30} />
            <Text style={styles.actionTitle}>Personalized Support</Text>
            <Text style={styles.actionDescription}>
              Based on your stress patterns, I recommend specific techniques tailored to your needs.
            </Text>
            <TouchableOpacity style={styles.actionButton}>
              <Text style={styles.actionButtonText}>View Recommendations</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </Card>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    margin: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 10,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  sectionCard: {
    borderRadius: 15,
    marginBottom: 15,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  symptomsCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#e74c3c',
  },
  triggersCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#9b59b6',
  },
  copingCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#27ae60',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 10,
  },
  chipsContainer: {
    flexDirection: 'row',
    paddingVertical: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10,
  },
  chipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
    marginRight: 5,
  },
  sectionDescription: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    marginTop: 10,
    fontStyle: 'italic',
  },
  copingContainer: {
    marginBottom: 15,
  },
  copingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
  },
  copingIcon: {
    marginRight: 15,
  },
  copingContent: {
    flex: 1,
  },
  copingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  copingDescription: {
    fontSize: 12,
    color: '#666',
  },
  actionCard: {
    borderRadius: 15,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  actionGradient: {
    padding: 20,
  },
  actionContent: {
    alignItems: 'center',
  },
  actionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 10,
    marginBottom: 8,
  },
  actionDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 15,
  },
  actionButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default KnowledgeGraphResponse;
