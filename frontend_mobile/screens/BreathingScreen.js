import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

const BreathingScreen = ({ navigation }) => {
  const [breathing, setBreathing] = useState(false);
  const [phase, setPhase] = useState('inhale');
  const [countdown, setCountdown] = useState(4);
  const animationValue = new Animated.Value(0);

  const startBreathing = () => {
    setBreathing(true);
    setPhase('inhale');
    setCountdown(4);
    animateBreathing();
  };

  const animateBreathing = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(animationValue, {
          toValue: 1,
          duration: 4000,
          useNativeDriver: false,
        }),
        Animated.timing(animationValue, {
          toValue: 0,
          duration: 4000,
          useNativeDriver: false,
        }),
      ])
    ).start();
  };

  useEffect(() => {
    if (breathing && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(prev => prev - 1);
        setPhase(prev => prev === 'inhale' ? 'hold' : prev === 'hold' ? 'exhale' : 'inhale');
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [breathing, countdown]);

  useEffect(() => {
    if (countdown === 0 && breathing) {
      setBreathing(false);
      setPhase('inhale');
    }
  }, [countdown, breathing]);

  const circleScale = animationValue.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.5],
  });

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#6B46C1', '#9333EA']}
        style={styles.header}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Breathing Exercise</Text>
      </LinearGradient>

      <View style={styles.content}>
        <Text style={styles.instruction}>
          {breathing 
            ? phase === 'inhale' 
              ? 'Breathe In...' 
              : phase === 'hold' 
                ? 'Hold...' 
                : 'Breathe Out...'
            : 'Tap to start 4-7-8 breathing exercise'
          }
        </Text>

        {breathing && (
          <View style={styles.breathingContainer}>
            <Animated.View
              style={[
                styles.breathingCircle,
                {
                  transform: [{ scale: circleScale }]
                }
              ]}
            >
              <Text style={styles.countdown}>{countdown}</Text>
            </Animated.View>
          </View>
        )}

        {!breathing && (
          <TouchableOpacity
            style={styles.startButton}
            onPress={startBreathing}
          >
            <Text style={styles.startButtonText}>Start Exercise</Text>
          </TouchableOpacity>
        )}

        <View style={styles.tipsContainer}>
          <Text style={styles.tipsTitle}>Tips:</Text>
          <Text style={styles.tip}>• Find a comfortable position</Text>
          <Text style={styles.tip}>• Breathe through your nose</Text>
          <Text style={styles.tip}>• Focus on the counting</Text>
          <Text style={styles.tip}>• Relax your shoulders</Text>
        </View>
      </View>
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
  content: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
  },
  instruction: {
    fontSize: 18,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 24,
  },
  breathingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  breathingCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(107, 70, 193, 0.1)',
    borderWidth: 3,
    borderColor: '#6B46C1',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  countdown: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#6B46C1',
  },
  startButton: {
    backgroundColor: '#6B46C1',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  startButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  tipsContainer: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 16,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tipsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 12,
  },
  tip: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 6,
    lineHeight: 20,
  },
});

export default BreathingScreen;
