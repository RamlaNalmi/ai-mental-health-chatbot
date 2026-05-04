import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';

/** Dev client often exposes the packager host (same as your PC) in the bundle URL. */
function hostFromSourceCode() {
  const url = NativeModules?.SourceCode?.scriptURL;
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/https?:\/\/([^:/]+)/);
  return m ? m[1] : null;
}

/**
 * Backend runs on your PC; only web/desktop can use localhost.
 * - Android emulator: 10.0.2.2 maps to the host machine.
 * - Expo Go on a phone: use the same LAN IP as Metro (from Expo manifest).
 * Override anytime: EXPO_PUBLIC_API_BASE_URL=http://192.168.1.10:8000
 */
export function getApiBaseUrl() {
  const fromEnv =
    typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_BASE_URL;
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }

  if (Platform.OS === 'web') {
    return 'http://localhost:8000';
  }

  const pickHostFromUri = (uri) => {
    if (!uri || typeof uri !== 'string') return null;
    const host = uri.split(':')[0];
    return host || null;
  };

  const expoCfg = Constants.expoConfig;
  const goCfg = Constants.expoGoConfig;

  let host =
    pickHostFromUri(expoCfg?.hostUri) ||
    pickHostFromUri(goCfg?.hostUri) ||
    pickHostFromUri(Constants.manifest?.debuggerHost) ||
    pickHostFromUri(Constants.manifest2?.extra?.expoGo?.debuggerHost) ||
    hostFromSourceCode();

  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:8000`;
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000';
  }

  return 'http://localhost:8000';
}
