import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'http://192.168.1.190:8000'; // Your computer's current LAN IP address

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000,
  headers: {
    'Content-Type': 'application/json',
  },
});

console.log('API base URL:', API_BASE_URL);

// Add auth token to requests
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.removeItem('authToken');
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  signUp: async (email, password) => {
    const response = await api.post('/auth/signup', { email, password });
    return response.data;
  },
  
  signIn: async (email, password) => {
    const response = await api.post('/auth/signin', { email, password });
    return response.data;
  },
};

export const chatAPI = {
  startSession: async () => {
    const response = await api.post('/chat/start');
    return response.data;
  },
  
  sendMessage: async (sessionId, message, voiceFeatures = null, keystrokes = null) => {
    // Add mock keystroke data if none provided to satisfy backend validation
    const mockKeystrokes = keystrokes || [
      {
        key: 'mock',
        ts_ms: Date.now(),
        type: 'down'
      }
    ];
    
    const payload = {
      text: message,
      voice_features: voiceFeatures,
      keystrokes: mockKeystrokes,
    };
    const response = await api.post(`/chat/message?session_id=${sessionId}`, payload);
    return response.data;
  },
};

export const baselineAPI = {
  getStatus: async () => {
    const response = await api.get('/baseline/status');
    return response.data;
  },
};

export default api;
