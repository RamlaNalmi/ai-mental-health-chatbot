import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  Vibration,
  Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI } from '../services/auth';

const SimpleChatScreen = ({ navigation }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [recording, setRecording] = useState(null);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);
  const [showRecordingModal, setShowRecordingModal] = useState(false);
  
  const flatListRef = useRef(null);
  const recordingTimerRef = useRef(null);

  useEffect(() => {
    startChatSession();
    
    return () => {
      if (recording) {
        stopRecording();
      }
    };
  }, []);

  const startChatSession = async () => {
    try {
      const response = await authAPI.startChatSession();
      setSessionId(response.session_id);
      
      // Add welcome message
      const welcomeMessage = {
        id: Date.now(),
        text: "Hi! I'm your mental wellness companion. How are you feeling today?",
        sender: 'assistant',
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
    } catch (error) {
      console.error('Failed to start chat session:', error);
      Alert.alert('Error', 'Failed to start chat session');
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

    try {
      const response = await authAPI.sendMessage(input.trim(), sessionId);

      const assistantMessage = {
        id: Date.now() + 1,
        text: response.reply || "I hear you. Thank you for sharing that with me. It takes courage to express your feelings.",
        sender: 'assistant',
        timestamp: new Date(),
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
      
      // Start recording timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      
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
      
      // Auto-stop after 5 seconds
      setTimeout(() => {
        if (isRecording) {
          stopRecording();
        }
      }, 5000);
      
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
      
      // Clear timer
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setIsRecording(false);
      setRecording(null);
      setShowRecordingModal(false);
      setRecordingTime(0);
      
      if (uri) {
        setLiveTranscript('Processing your voice...');
        // Simulate processing
        setTimeout(() => {
          setInput("I'm feeling a bit anxious today");
          setLiveTranscript('I\'m feeling a bit anxious today');
          setTimeout(() => setLiveTranscript(''), 3000);
        }, 2000);
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

  const renderMessage = ({ item }) => {
    const isUser = item.sender === 'user';
    
    return (
      <View style={[
        styles.messageContainer,
        isUser ? styles.userMessage : styles.assistantMessage,
      ]}>
        <View style={[
          styles.messageBubble,
          isUser ? styles.userBubble : styles.assistantBubble
        ]}>
          <Text style={[
            styles.messageText,
            isUser ? styles.userText : styles.assistantText
          ]}>
            {item.text}
          </Text>
        </View>
        <Text style={styles.timestamp}>
          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    );
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>AI Companion</Text>
          <Text style={styles.headerSubtitle}>Your wellness guide</Text>
        </View>
        <View style={styles.statusContainer}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>Online</Text>
        </View>
      </View>

      {/* Recording Modal */}
      <Modal
        visible={showRecordingModal}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.recordingModalOverlay}>
          <View style={styles.recordingModalContent}>
            <View style={styles.recordingCircle}>
              <Ionicons name="mic" size={40} color="#fff" />
            </View>
            
            <View style={styles.recordingInfo}>
              <Text style={styles.recordingTime}>{formatTime(recordingTime)}</Text>
              <Text style={styles.recordingStatus}>Recording...</Text>
            </View>
            
            <Text style={styles.liveTranscriptText}>{liveTranscript}</Text>
            
            <TouchableOpacity
              style={styles.stopRecordingButton}
              onPress={stopRecording}
            >
              <Ionicons name="stop" size={24} color="#fff" />
              <Text style={styles.stopRecordingText}>Stop Recording</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Messages */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.chatContainer}
      >
        <ScrollView
          ref={flatListRef}
          style={styles.messagesList}
          contentContainerStyle={styles.messagesContainer}
          showsVerticalScrollIndicator={false}
        >
          {messages.map(renderMessage)}
        </ScrollView>
        
        {liveTranscript && !showRecordingModal && (
          <View style={styles.transcriptContainer}>
            <Text style={styles.transcriptText}>{liveTranscript}</Text>
          </View>
        )}
        
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="Type or tap microphone to speak..."
            placeholderTextColor="#999"
            multiline
            maxLength={500}
          />
          
          <TouchableOpacity
            style={[
              styles.recordButton,
              isRecording && styles.recordingButton
            ]}
            onPress={isRecording ? stopRecording : startRecording}
          >
            <Ionicons
              name={isRecording ? "stop" : "mic"}
              size={24}
              color="#fff"
            />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.sendButton,
              !input.trim() && styles.disabledButton
            ]}
            onPress={sendMessage}
            disabled={!input.trim() || loading}
          >
            <Ionicons
              name="send"
              size={24}
              color="#fff"
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    backgroundColor: '#6B46C1',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 16,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  statusContainer: {
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    backgroundColor: '#4CAF50',
    borderRadius: 4,
    marginBottom: 4,
  },
  statusText: {
    fontSize: 10,
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
    marginVertical: 5,
    alignItems: 'flex-end',
  },
  userMessage: {
    alignItems: 'flex-end',
  },
  assistantMessage: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 15,
    borderRadius: 20,
    marginHorizontal: 5,
  },
  userBubble: {
    backgroundColor: '#6B46C1',
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
  timestamp: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 4,
    marginHorizontal: 10,
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
    width: '90%',
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
  liveTranscriptText: {
    fontSize: 16,
    color: '#6B46C1',
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
  },
  stopRecordingText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  transcriptContainer: {
    backgroundColor: 'rgba(107, 70, 193, 0.1)',
    padding: 10,
    margin: 20,
    borderRadius: 10,
  },
  transcriptText: {
    textAlign: 'center',
    color: '#6B46C1',
    fontStyle: 'italic',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    maxHeight: 100,
    marginRight: 10,
  },
  recordButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#764ba2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  recordingButton: {
    backgroundColor: '#e74c3c',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6B46C1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
});

export default SimpleChatScreen;
