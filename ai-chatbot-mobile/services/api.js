import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrl } from './apiBase';

export const API_BASE_URL = getApiBaseUrl();

if (__DEV__) {
  // eslint-disable-next-line no-console
  console.log('[api] API_BASE_URL =', API_BASE_URL);
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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

/** User-visible message for failed auth/chat requests (network vs validation). */
export function formatApiError(error, fallback = 'Something went wrong') {
  const detail = error.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((e) => e.msg || JSON.stringify(e)).join('\n');
  }
  if (error.code === 'ECONNABORTED') {
    return 'Request timed out. Is the backend running on port 8000?';
  }
  if (error.message === 'Network Error' || error.code === 'ERR_NETWORK') {
    return (
      'Cannot reach the API. Start the backend on port 8000 with --host 0.0.0.0. ' +
      'On a phone, the URL must be your PC LAN address (see Metro log: [api] API_BASE_URL).'
    );
  }
  return error.message || fallback;
}

export default api;
