import axios from 'axios';
import { Platform } from 'react-native';

// Choose a sensible default depending on runtime environment:
// - Android emulator (Android Studio): use 10.0.2.2 to reach host machine
// - iOS simulator: localhost reaches host machine
// - Physical device / Expo Go: replace the placeholder with your computer IP (see EXPO_SETUP.md)
let API_URL = 'http://YOUR_PC_IP:8000';
if (Platform.OS === 'android') {
  API_URL = 'http://10.0.2.2:8000';
} else if (Platform.OS === 'ios') {
  API_URL = 'http://localhost:8000';
}

if (API_URL.includes('YOUR_PC_IP')) {
  console.warn('api: please set API URL to your computer IP in api/api.ts or EXPO_SETUP.md');
}

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
});

export const signup = (email: string, password: string) =>
  api.post('/auth/signup', { email, password });

export const signin = (email: string, password: string) =>
  api.post('/auth/signin', { email, password });

export const sendChatMessage = (session_id: number, text: string, voice_features?: any, keystrokes?: any) =>
  api.post(`/chat/message?session_id=${session_id}`, {
    text,
    voice_features,
    keystrokes,
  });

export const startChatSession = () => api.post('/chat/start');
export const getBaselineStatus = () => api.get('/baseline/status');
export default api;