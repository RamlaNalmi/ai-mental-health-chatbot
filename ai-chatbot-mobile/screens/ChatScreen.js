import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Voice from '../services/voice';
import { chatAPI, baselineAPI } from '../services/api';
import { removeAuthToken } from '../services/auth';

const ChatScreen = ({ navigation }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [cognitiveLoad, setCognitiveLoad] = useState(null);
  const [baselineStatus, setBaselineStatus] = useState({ is_ready: false, n_samples: 0 });
  const flatListRef = useRef(null);

  useEffect(() => {
    initializeChat();
    setupVoiceRecognition();
    fetchBaselineStatus();
    
    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  const initializeChat = async () => {
    try {
      console.log('Starting chat session...');
      const session = await chatAPI.startSession();
      console.log('Chat session started:', session);
      setSessionId(session.session_id);
      
      // Add welcome message
      setMessages([{
        id: 1,
        text: "Hello! I'm your mental health companion. How are you feeling today?",
        sender: 'assistant',
        timestamp: new Date(),
      }]);
    } catch (error) {
      console.error('Failed to start chat session:', error);
      Alert.alert('Error', `Failed to start chat session: ${error.message}`);
    }
  };

  const fetchBaselineStatus = async () => {
    try {
      const status = await baselineAPI.getStatus();
      setBaselineStatus(status);
    } catch (error) {
      console.error('Failed to fetch baseline status:', error);
    }
  };

  const setupVoiceRecognition = () => {
    Voice.onSpeechStart = () => setIsRecording(true);
    Voice.onSpeechEnd = () => setIsRecording(false);
    Voice.onSpeechResults = (e) => {
      setInput(e.value[0]);
    };
    Voice.onSpeechError = (e) => {
      setIsRecording(false);
      console.error('Speech recognition error:', e);
    };
  };

  const startRecording = async () => {
    try {
      await Voice.start('en-US');
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  const stopRecording = async () => {
    try {
      await Voice.stop();
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !sessionId) {
      console.log('Cannot send message: no input or session');
      return;
    }

    const userMessage = {
      id: Date.now(),
      text: input.trim(),
      sender: 'user',
      timestamp: new Date(),
    };

    console.log('Sending message:', userMessage);
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      console.log('Calling API with session ID:', sessionId);
      const response = await chatAPI.sendMessage(sessionId, userMessage.text);
      console.log('API response:', response);
      
      const assistantMessage = {
        id: Date.now() + 1,
        text: response.reply,
        sender: 'assistant',
        timestamp: new Date(),
        cognitiveLoad: response.predicted_label,
        baselineReady: response.baseline_ready,
      };

      setMessages(prev => [...prev, assistantMessage]);
      setCognitiveLoad(response.predicted_label);
      
      if (response.baseline_ready !== baselineStatus.is_ready) {
        fetchBaselineStatus();
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      Alert.alert('Error', `Failed to send message: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          onPress: async () => {
            await removeAuthToken();
            navigation.replace('SignIn');
          },
        },
      ]
    );
  };

  const renderMessage = ({ item }) => (
    <View
      style={[
        styles.messageContainer,
        item.sender === 'user' ? styles.userMessage : styles.assistantMessage,
      ]}
    >
      <Text style={[
        styles.messageText,
        item.sender === 'user' ? styles.userMessageText : styles.assistantMessageText,
      ]}>
        {item.text}
      </Text>
      
      {item.cognitiveLoad && (
        <View style={styles.cognitiveLoadBadge}>
          <Text style={styles.cognitiveLoadText}>
            Load: {item.cognitiveLoad}
          </Text>
        </View>
      )}
      
      <Text style={styles.timestamp}>
        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.headerTitle}>MindfulChat</Text>
            <Text style={styles.headerSubtitle}>
              {!baselineStatus.is_ready 
                ? `Building baseline (${baselineStatus.n_samples}/10 samples)` 
                : 'Personalization active'
              }
            </Text>
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity onPress={() => console.log('Current session ID:', sessionId)} style={styles.testButton}>
              <MaterialIcons name="bug-report" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSignOut} style={styles.signOutButton}>
              <MaterialIcons name="logout" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        
        {cognitiveLoad && (
          <View style={styles.cognitiveLoadIndicator}>
            <Text style={styles.cognitiveLoadIndicatorText}>
              Current Load: {cognitiveLoad}
            </Text>
          </View>
        )}
      </View>

      <KeyboardAvoidingView 
        style={styles.chatContainer}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <FlatList
          ref={flatListRef}
          style={styles.messagesList}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id.toString()}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />

        <View style={styles.inputContainer}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              value={input}
              onChangeText={setInput}
              placeholder="Type a message..."
              placeholderTextColor="#999"
              multiline
              maxLength={500}
            />
            
            <TouchableOpacity
              style={[styles.voiceButton, isRecording && styles.voiceButtonActive]}
              onPress={isRecording ? stopRecording : startRecording}
            >
              <MaterialIcons 
                name={isRecording ? "mic" : "mic-none"} 
                size={24} 
                color={isRecording ? "#fff" : "#667eea"} 
              />
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.sendButton, loading && styles.sendButtonDisabled]}
              onPress={sendMessage}
              disabled={loading || !input.trim()}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <MaterialIcons name="send" size={20} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#667eea',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 15,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#e0e0e0',
    marginTop: 2,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  testButton: {
    padding: 8,
    marginRight: 8,
  },
  signOutButton: {
    padding: 8,
  },
  cognitiveLoadIndicator: {
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  cognitiveLoadIndicatorText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  chatContainer: {
    flex: 1,
  },
  messagesList: {
    flex: 1,
    padding: 20,
  },
  messageContainer: {
    maxWidth: '80%',
    marginVertical: 5,
    padding: 15,
    borderRadius: 20,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#667eea',
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userMessageText: {
    color: '#fff',
  },
  assistantMessageText: {
    color: '#333',
  },
  cognitiveLoadBadge: {
    marginTop: 8,
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
    padding: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  cognitiveLoadText: {
    fontSize: 10,
    color: '#667eea',
    fontWeight: '600',
  },
  timestamp: {
    fontSize: 10,
    color: '#999',
    marginTop: 5,
  },
  inputContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 25,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginRight: 10,
    maxHeight: 100,
    fontSize: 16,
  },
  voiceButton: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  voiceButtonActive: {
    backgroundColor: '#ff4444',
  },
  sendButton: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    backgroundColor: '#667eea',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
});

export default ChatScreen;
