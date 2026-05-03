import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Animated,
  Alert,
  Modal,
  Vibration,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, Avatar, Button } from 'react-native-elements';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/api';
import KnowledgeGraphResponse from '../components/KnowledgeGraphResponse';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const ModernChatScreen = ({ navigation }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [recording, setRecording] = useState(null);
  const [recordingTimer, setRecordingTimer] = useState(null);
  const [transcriptionTimer, setTranscriptionTimer] = useState(null);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [keystrokes, setKeystrokes] = useState([]);
  const [typingStartTime, setTypingStartTime] = useState(null);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showRecordingModal, setShowRecordingModal] = useState(false);
  const [recordingLevel, setRecordingLevel] = useState(0);
  const [pulseAnim] = useState(new Animated.Value(1));
  const [waveformAnim] = useState(new Animated.Value(0));
  
  const flatListRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    startChatSession();
    animateIn();
    
    // Keyboard listener
    const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
      if (recording) {
        stopRecording();
      }
    };
  }, []);

  const animateIn = () => {
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
  };

  const startChatSession = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      const response = await api.post('/chat/start', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSessionId(response.data.session_id);
      
      // Add welcome message
      const welcomeMessage = {
        id: Date.now(),
        text: "Hi! I'm MindMate, your mental wellness companion. How are you feeling today?",
        sender: 'assistant',
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
    } catch (error) {
      console.error('Failed to start chat session:', error);
      Alert.alert('Error', 'Failed to start chat session');
    }
  };

  const startTyping = () => {
    if (!typingStartTime) {
      setTypingStartTime(Date.now());
    }
  };

  const recordKeystroke = (key) => {
    if (typingStartTime) {
      const keystroke = {
        key: key,
        timestamp: Date.now(),
        time_since_start: Date.now() - typingStartTime,
      };
      setKeystrokes(prev => [...prev, keystroke]);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !sessionId) return;

    const userMessage = {
      id: Date.now(),
      text: input.trim(),
      sender: 'user',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setKeystrokes([]);
    setTypingStartTime(null);

    try {
      const token = await AsyncStorage.getItem('authToken');
      const response = await api.post(`/chat/message?session_id=${sessionId}`, {
        text: input.trim(),
        keystrokes: keystrokes,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const assistantMessage = {
        id: Date.now() + 1,
        text: response.data.reply,
        sender: 'assistant',
        timestamp: new Date(),
        stressLabel: response.data.stress_label,
        stressConfidence: response.data.stress_confidence,
        kgResponse: response.data.kg_response,
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Failed to send message:', error);
      Alert.alert('Error', 'Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      console.log('🎤 Starting recording...');
      Vibration.vibrate(100);
      
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant microphone permission');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const newRecording = new Audio.Recording();
      setRecording(newRecording);
      await newRecording.prepareToRecordAsync(Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY);
      await newRecording.startAsync();
      
      setIsRecording(true);
      setShowRecordingModal(true);
      setRecordingTime(0);
      setLiveTranscript('Listening...');
      
      // Start pulse animation
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      
      // Start waveform animation
      const wave = Animated.loop(
        Animated.timing(waveformAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: false,
        })
      );
      wave.start();
      
      // Start recording timer
      const timer = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      setRecordingTimer(timer);
      
      // Simulate real-time transcription
      let transcriptText = '';
      const simulateTranscription = setInterval(() => {
        const phrases = [
          "I'm feeling",
          "I'm feeling a bit",
          "I'm feeling a bit anxious",
          "I'm feeling a bit anxious today",
        ];
        transcriptText = phrases[Math.min(Math.floor(transcriptText.length / 10), phrases.length - 1)];
        setLiveTranscript(transcriptText);
      }, 1500);
      setTranscriptionTimer(simulateTranscription);
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      console.log('🎤 Stopping recording...');
      Vibration.vibrate(100);
      
      // Stop animations
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).stop();
      
      // Clear timers
      if (recordingTimer) {
        clearInterval(recordingTimer);
        setRecordingTimer(null);
      }
      if (transcriptionTimer) {
        clearInterval(transcriptionTimer);
        setTranscriptionTimer(null);
      }
      
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setIsRecording(false);
      setRecording(null);
      setShowRecordingModal(false);
      setRecordingTime(0);
      
      if (uri) {
        setLiveTranscript('Processing your voice...');
        await processAudioFile(uri);
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
      setIsRecording(false);
      setRecording(null);
      setShowRecordingModal(false);
      setLiveTranscript('Recording failed');
      setTimeout(() => setLiveTranscript(''), 3000);
    }
  };

  const processAudioFile = async (audioUri) => {
    try {
      console.log('🎤 Processing audio file:', audioUri);
      setLiveTranscript('Processing your voice...');
      
      const token = await AsyncStorage.getItem('authToken');
      const formData = new FormData();
      formData.append('file', {
        uri: audioUri,
        type: 'audio/wav',
        name: 'recording.wav',
      });

      const response = await api.post('/upload-audio', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.data.success) {
        setLiveTranscript(`"${response.data.transcript}"`);
        
        const assistantMessage = {
          id: Date.now() + 1,
          text: `I heard: "${response.data.transcript}". Your stress level appears to be ${response.data.final_label === 1 ? 'elevated' : 'normal'}. Let's talk about what's on your mind.`,
          sender: 'assistant',
          timestamp: new Date(),
          stressLabel: response.data.final_label,
          stressConfidence: response.data.final_score,
        };
        
        setMessages(prev => [...prev, assistantMessage]);
        
        setTimeout(() => setLiveTranscript(''), 5000);
      } else {
        setLiveTranscript('Processing failed');
        setTimeout(() => setLiveTranscript(''), 3000);
      }
    } catch (error) {
      console.error('Failed to process audio:', error);
      setLiveTranscript('Processing failed');
      setTimeout(() => setLiveTranscript(''), 3000);
    }
  };

  const renderMessage = ({ item, index }) => {
    const isUser = item.sender === 'user';
    
    return (
      <Animated.View
        style={[
          styles.messageContainer,
          isUser ? styles.userMessage : styles.assistantMessage,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {!isUser && (
          <Avatar
            rounded
            size="small"
            title="MM"
            containerStyle={styles.avatar}
            overlayContainerStyle={{ backgroundColor: '#667eea' }}
          />
        )}
        
        <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
          <Text style={[styles.messageText, isUser ? styles.userText : styles.assistantText]}>
            {item.text}
          </Text>
          
          {item.stressLabel !== undefined && (
            <View style={styles.stressIndicator}>
              <Text style={styles.stressText}>
                Stress: {item.stressLabel === 1 ? 'High' : 'Low'} ({(item.stressConfidence * 100).toFixed(0)}%)
              </Text>
            </View>
          )}
          
          {item.kgResponse && (
            <KnowledgeGraphResponse
              kgData={item.kgResponse}
              onSymptomPress={(symptom) => console.log('Symptom pressed:', symptom)}
              onTriggerPress={(trigger) => console.log('Trigger pressed:', trigger)}
              onCopingPress={(coping) => console.log('Coping pressed:', coping)}
            />
          )}
        </View>
        
        {isUser && (
          <Avatar
            rounded
            size="small"
            title="You"
            containerStyle={styles.avatar}
            overlayContainerStyle={{ backgroundColor: '#764ba2' }}
          />
        )}
      </Animated.View>
    );
  };

  const renderInput = () => (
    <View style={[styles.inputContainer, { paddingBottom: Platform.OS === 'ios' ? keyboardHeight : 20 }]}>
      {liveTranscript ? (
        <View style={styles.transcriptContainer}>
          <Text style={styles.transcriptText}>{liveTranscript}</Text>
        </View>
      ) : null}
      
      <View style={styles.inputRow}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            onKeyPress={({ nativeEvent }) => recordKeystroke(nativeEvent.key)}
            onFocus={startTyping}
            placeholder="Share how you're feeling..."
            placeholderTextColor="#999"
            multiline
            maxLength={500}
          />
        </View>
        
        <TouchableOpacity
          style={[styles.recordButton, isRecording && styles.recordingButton]}
          onPressIn={startRecording}
          onPressOut={stopRecording}
        >
          <Icon
            name={isRecording ? "stop" : "mic"}
            type="material"
            size={24}
            color="#fff"
          />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.sendButton, !input.trim() && styles.disabledButton]}
          onPress={sendMessage}
          disabled={!input.trim() || loading}
        >
          <Icon
            name="send"
            type="material"
            size={24}
            color="#fff"
          />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <LinearGradient
      colors={['#f5f7fa', '#c3cfe2']}
      style={styles.container}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('Analytics')}>
          <Icon name="bar-chart" type="material" color="#fff" size={24} />
        </TouchableOpacity>
        
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>MindMate</Text>
          <Text style={styles.headerSubtitle}>Your wellness companion</Text>
        </View>
        
        <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
          <Icon name="person" type="material" color="#fff" size={24} />
        </TouchableOpacity>
      </View>

      {/* Recording Modal */}
      <Modal
        visible={showRecordingModal}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.recordingModalOverlay}>
          <View style={styles.recordingModalContent}>
            <Animated.View style={[styles.recordingCircle, { transform: [{ scale: pulseAnim }] }]}>
              <Icon name="mic" type="material" size={40} color="#fff" />
            </Animated.View>
            
            <View style={styles.recordingInfo}>
              <Text style={styles.recordingTime}>
                {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
              </Text>
              <Text style={styles.recordingStatus}>Recording...</Text>
            </View>
            
            <View style={styles.waveformContainer}>
              {[...Array(20)].map((_, i) => (
                <Animated.View
                  key={i}
                  style={[
                    styles.waveformBar,
                    {
                      height: Animated.multiply(
                        waveformAnim,
                        Math.random() * 30 + 10
                      ),
                      backgroundColor: '#667eea',
                    }
                  ]}
                />
              ))}
            </View>
            
            <Text style={styles.liveTranscriptText}>{liveTranscript}</Text>
            
            <TouchableOpacity
              style={styles.stopRecordingButton}
              onPress={stopRecording}
            >
              <Icon name="stop" type="material" size={24} color="#fff" />
              <Text style={styles.stopRecordingText}>Stop Recording</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Messages */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.chatContainer}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id.toString()}
          style={styles.messagesList}
          contentContainerStyle={styles.messagesContainer}
          showsVerticalScrollIndicator={false}
        />
        
        {renderInput()}
      </KeyboardAvoidingView>
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
    backgroundColor: 'transparent',
  },
  headerContent: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  chatContainer: {
    flex: 1,
  },
  messagesList: {
    flex: 1,
  },
  messagesContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  messageContainer: {
    flexDirection: 'row',
    marginVertical: 5,
    alignItems: 'flex-end',
  },
  userMessage: {
    justifyContent: 'flex-end',
  },
  assistantMessage: {
    justifyContent: 'flex-start',
  },
  avatar: {
    marginHorizontal: 10,
  },
  messageBubble: {
    maxWidth: screenWidth * 0.7,
    padding: 15,
    borderRadius: 20,
    marginHorizontal: 5,
  },
  userBubble: {
    backgroundColor: '#667eea',
    borderBottomRightRadius: 5,
  },
  assistantBubble: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userText: {
    color: '#fff',
  },
  assistantText: {
    color: '#333',
  },
  stressIndicator: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  stressText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    fontStyle: 'italic',
  },
  inputContainer: {
    backgroundColor: 'transparent',
  },
  transcriptContainer: {
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
    padding: 10,
    marginHorizontal: 20,
    borderRadius: 10,
    marginBottom: 10,
  },
  transcriptText: {
    textAlign: 'center',
    color: '#667eea',
    fontStyle: 'italic',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  inputWrapper: {
    flex: 1,
    marginRight: 10,
  },
  textInput: {
    backgroundColor: '#fff',
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 15,
    fontSize: 16,
    maxHeight: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  recordButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#764ba2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  recordingButton: {
    backgroundColor: '#e74c3c',
  },
  sendButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#667eea',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  recordingModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingModalContent: {
    backgroundColor: '#fff',
    padding: 30,
    borderRadius: 20,
    alignItems: 'center',
    width: screenWidth * 0.9,
    maxWidth: 350,
  },
  recordingCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e74c3c',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  recordingInfo: {
    alignItems: 'center',
    marginBottom: 20,
  },
  recordingTime: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  recordingStatus: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 60,
    marginBottom: 20,
    justifyContent: 'center',
    gap: 2,
  },
  waveformBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: '#667eea',
  },
  liveTranscriptText: {
    fontSize: 16,
    color: '#667eea',
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 20,
    minHeight: 40,
  },
  stopRecordingButton: {
    backgroundColor: '#e74c3c',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  stopRecordingText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default ModernChatScreen;
