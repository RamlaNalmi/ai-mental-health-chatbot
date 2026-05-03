import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  ActivityIndicator,
  Animated,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { CameraView } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { faceStressAPI } from '../services/api';

const { width: screenWidth } = Dimensions.get('window');

const FaceStressDetector = ({ 
  onStressDetected, 
  isActive, 
  onToggle,
  sessionId 
}) => {
  const [hasPermission, setHasPermission] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [stressLevel, setStressLevel] = useState(null);
  const [confidence, setConfidence] = useState(null);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [pulseAnimation] = useState(new Animated.Value(1));
  
  const cameraRef = useRef(null);

  // Request camera permissions
  useEffect(() => {
    (async () => {
      const { status } = await CameraView.getCameraPermissionsAsync();
      if (status !== 'granted') {
        const { status: newStatus } = await CameraView.requestCameraPermissionsAsync();
        setHasPermission(newStatus === 'granted');
      } else {
        setHasPermission(true);
      }
    })();
  }, []);

  // Pulse animation when scanning
  useEffect(() => {
    if (isScanning) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnimation, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnimation, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [isScanning, pulseAnimation]);

  const captureAndAnalyze = useCallback(async () => {
    if (!cameraRef.current) return;
    
    try {
      setProcessing(true);
      
      // Capture photo
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
        skipProcessing: false,
      });

      // Resize image for faster processing
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 640, height: 480 } }],
        {
          compress: 0.7,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        }
      );

      // Send to backend for face stress analysis
      const imageFile = {
        uri: manipulatedImage.uri,
        type: 'image/jpeg',
        name: `face_capture_${Date.now()}.jpg`,
      };

      const response = await faceStressAPI.detectStress(imageFile);

      if (response && response.face_stress_level) {
        const newStressLevel = response.face_stress_level;
        const newConfidence = response.face_confidence || 0.8;
        
        setStressLevel(newStressLevel);
        setConfidence(newConfidence);
        
        // Callback to parent component
        if (onStressDetected) {
          onStressDetected({
            face_stress_level: newStressLevel,
            face_confidence: newConfidence,
            timestamp: new Date().toISOString(),
          });
        }
      }

      setCameraVisible(false);
      setIsScanning(false);
      
    } catch (error) {
      console.error('Face stress detection error:', error);
      Alert.alert('Error', 'Failed to analyze face stress. Please try again.');
      setIsScanning(false);
      setCameraVisible(false);
    } finally {
      setProcessing(false);
    }
  }, [onStressDetected]);

  const startFaceScanning = () => {
    if (hasPermission === false) {
      Alert.alert('Permission Required', 'Camera access is required for face stress detection.');
      return;
    }
    
    setCameraVisible(true);
    setIsScanning(true);
  };

  const stopFaceScanning = () => {
    setIsScanning(false);
    setCameraVisible(false);
  };

  const getStressColor = () => {
    if (!stressLevel) return '#94a3b8';
    switch (stressLevel) {
      case 'no_stress': return '#22c55e';
      case 'low': return '#eab308';
      case 'moderate': return '#f97316';
      case 'high': return '#ef4444';
      default: return '#94a3b8';
    }
  };

  const getStressIcon = () => {
    if (!stressLevel) return 'face';
    switch (stressLevel) {
      case 'no_stress': return 'sentiment-very-satisfied';
      case 'low': return 'sentiment-satisfied';
      case 'moderate': return 'sentiment-neutral';
      case 'high': return 'sentiment-very-dissatisfied';
      default: return 'face';
    }
  };

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#6366f1" />
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Icon name="camera-alt" size={24} color="#94a3b8" />
        <Text style={styles.statusText}>Camera permission required</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Face Stress Status Indicator */}
      <TouchableOpacity 
        style={[styles.stressIndicator, { backgroundColor: getStressColor() }]}
        onPress={isActive ? stopFaceScanning : startFaceScanning}
      >
        <Animated.View style={{ transform: [{ scale: pulseAnimation }] }}>
          <Icon 
            name={getStressIcon()} 
            size={24} 
            color="white" 
          />
        </Animated.View>
        <Text style={styles.stressText}>
          {stressLevel ? stressLevel.replace('_', ' ').toUpperCase() : 'SCAN FACE'}
        </Text>
        {confidence && (
          <Text style={styles.confidenceText}>
            {(confidence * 100).toFixed(0)}%
          </Text>
        )}
      </TouchableOpacity>

      {/* Camera Modal */}
      <Modal
        visible={cameraVisible}
        animationType="slide"
        onRequestClose={stopFaceScanning}
      >
        <View style={styles.cameraContainer}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="front"
            autoFocus="on"
            whiteBalance="auto"
          />
          
          {/* Camera Overlay */}
          <View style={styles.cameraOverlay}>
            <View style={styles.cameraHeader}>
              <TouchableOpacity onPress={stopFaceScanning} style={styles.closeButton}>
                <Icon name="close" size={24} color="white" />
              </TouchableOpacity>
              <Text style={styles.cameraTitle}>Face Stress Detection</Text>
              <View style={styles.placeholder} />
            </View>
            
            <View style={styles.cameraFooter}>
              {processing ? (
                <View style={styles.processingContainer}>
                  <ActivityIndicator size="large" color="white" />
                  <Text style={styles.processingText}>Analyzing stress...</Text>
                </View>
              ) : (
                <TouchableOpacity 
                  style={styles.captureButton}
                  onPress={captureAndAnalyze}
                >
                  <Icon name="camera" size={32} color="white" />
                </TouchableOpacity>
              )}
              
              <Text style={styles.instructionText}>
                Center your face and tap capture
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stressIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#6366f1',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  stressText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 8,
  },
  confidenceText: {
    color: 'white',
    fontSize: 10,
    marginLeft: 4,
    opacity: 0.8,
  },
  statusText: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
  },
  
  // Camera Modal Styles
  cameraContainer: {
    flex: 1,
    backgroundColor: 'black',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  cameraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  closeButton: {
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
  },
  cameraTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  placeholder: {
    width: 36,
  },
  cameraFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 40,
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  instructionText: {
    color: 'white',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 8,
    borderRadius: 20,
  },
  processingContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  processingText: {
    color: 'white',
    fontSize: 16,
    marginTop: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
});

export default FaceStressDetector;
