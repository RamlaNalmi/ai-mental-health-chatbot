import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
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
  Animated,
  Easing,
  ScrollView,
  Dimensions,
  StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { Camera } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { chatAPI, baselineAPI, audioAPI, sensorAPI, faceAPI } from '../services/api';
import { removeAuthToken } from '../services/auth';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Design tokens ───────────────────────────────────────────────────
const COLORS = {
  bg:          '#0D0F14',
  surface:     '#151821',
  surfaceHigh: '#1E2230',
  border:      'rgba(255,255,255,0.07)',
  borderHigh:  'rgba(255,255,255,0.14)',
  primary:     '#7C6FCD',
  primaryDim:  '#3D3669',
  accent:      '#5DCAA5',
  accentDim:   '#1D4D3C',
  danger:      '#E24B4A',
  dangerDim:   '#501313',
  amber:       '#EF9F27',
  amberDim:    '#412402',
  textPrimary: '#F0EEF9',
  textSecond:  '#8B87A8',
  textMuted:   '#4A4760',
  userBubble:  '#7C6FCD',
  botBubble:   '#1E2230',
};

// ─── Stress level → visual config ────────────────────────────────────
const STRESS_CONFIG = {
  no_stress: { color: COLORS.accent,   label: 'Calm',     icon: '◎' },
  low:       { color: '#EAB308',       label: 'Mild',     icon: '◑' },
  moderate:  { color: COLORS.amber,    label: 'Moderate', icon: '◕' },
  high:      { color: COLORS.danger,   label: 'High',     icon: '●' },
};

// ─── Pulse animation hook ────────────────────────────────────────────
function usePulse(active, speed = 1000) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) { anim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1.15, duration: speed, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(anim, { toValue: 1,    duration: speed, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, speed]);
  return anim;
}

// ─── Fade-in animation hook ──────────────────────────────────────────
function useFadeIn(trigger) {
  const anim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(anim,      { toValue: 1, duration: 280, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      Animated.timing(slideAnim, { toValue: 0, duration: 280, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
    ]).start();
  }, [trigger]);
  return { opacity: anim, translateY: slideAnim };
}

// ─── Typing indicator ────────────────────────────────────────────────
const TypingDots = () => {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.loop(Animated.sequence([
        Animated.delay(i * 160),
        Animated.timing(dot, { toValue: -5, duration: 320, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(dot, { toValue: 0,  duration: 320, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ]))
    );
    Animated.parallel(animations).start();
    return () => animations.forEach(a => a.stop());
  }, []);
  return (
    <View style={styles.typingContainer}>
      {dots.map((dot, i) => (
        <Animated.View key={i} style={[styles.typingDot, { transform: [{ translateY: dot }] }]} />
      ))}
    </View>
  );
};

// ─── Stress gauge ring ───────────────────────────────────────────────
const StressRing = ({ level = 'no_stress', score = 0, bpm = null }) => {
  const cfg = STRESS_CONFIG[level] || STRESS_CONFIG.no_stress;
  const ringAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(ringAnim, { toValue: score, duration: 600, useNativeDriver: false, easing: Easing.out(Easing.cubic) }).start();
  }, [score]);
  return (
    <View style={styles.stressRingWrap}>
      <View style={[styles.stressRingOuter, { borderColor: cfg.color + '40' }]}>
        <View style={[styles.stressRingInner, { borderColor: cfg.color }]}>
          <Text style={[styles.stressRingIcon, { color: cfg.color }]}>{cfg.icon}</Text>
          <Text style={[styles.stressRingLabel, { color: cfg.color }]}>{cfg.label}</Text>
          {bpm && <Text style={styles.stressRingBpm}>{Math.round(bpm)} bpm</Text>}
        </View>
      </View>
    </View>
  );
};

// ─── Signal pills ────────────────────────────────────────────────────
const SignalPill = ({ label, active, color }) => (
  <View style={[styles.signalPill, active && { backgroundColor: color + '22', borderColor: color + '66' }]}>
    <View style={[styles.signalDot, { backgroundColor: active ? color : COLORS.textMuted }]} />
    <Text style={[styles.signalLabel, { color: active ? color : COLORS.textMuted }]}>{label}</Text>
  </View>
);

// ─── Message bubble ──────────────────────────────────────────────────
const MessageBubble = memo(({ item }) => {
  const { opacity, translateY } = useFadeIn(item.id);
  const isUser = item.role === 'user';
  const isSystem = item.role === 'system';

  if (isSystem) {
    return (
      <Animated.View style={[styles.systemMsg, { opacity, transform: [{ translateY }] }]}>
        <Text style={styles.systemMsgText}>{item.content}</Text>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[
      styles.bubbleRow,
      isUser ? styles.bubbleRowUser : styles.bubbleRowBot,
      { opacity, transform: [{ translateY }] },
    ]}>
      {!isUser && (
        <View style={styles.avatarDot}>
          <Text style={styles.avatarDotText}>M</Text>
        </View>
      )}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
        <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextBot]}>
          {item.content}
        </Text>
        {item.meta && (
          <View style={styles.bubbleMeta}>
            {item.meta.stress_label !== undefined && (
              <Text style={[styles.bubbleMetaText, { color: item.meta.stress_label === 1 ? COLORS.danger : COLORS.accent }]}>
                {item.meta.stress_label === 1 ? '↑ stress detected' : '✓ calm'}
              </Text>
            )}
            {item.meta.fused_label && (
              <Text style={[styles.bubbleMetaText, { color: STRESS_CONFIG[item.meta.fused_label]?.color || COLORS.textMuted }]}>
                {STRESS_CONFIG[item.meta.fused_label]?.label}
              </Text>
            )}
          </View>
        )}
        <Text style={styles.bubbleTime}>
          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </Animated.View>
  );
});

// ─── Voice waveform ──────────────────────────────────────────────────
const VoiceWave = ({ active }) => {
  const bars = Array.from({ length: 20 }, (_, i) => useRef(new Animated.Value(0.2)).current);
  useEffect(() => {
    if (!active) { bars.forEach(b => b.setValue(0.2)); return; }
    const animations = bars.map((bar, i) =>
      Animated.loop(Animated.sequence([
        Animated.delay(i * 60),
        Animated.timing(bar, { toValue: Math.random() * 0.8 + 0.2, duration: 300 + Math.random() * 200, useNativeDriver: false }),
        Animated.timing(bar, { toValue: 0.2, duration: 300, useNativeDriver: false }),
      ]))
    );
    Animated.parallel(animations).start();
    return () => animations.forEach(a => a.stop());
  }, [active]);
  return (
    <View style={styles.waveWrap}>
      {bars.map((bar, i) => (
        <Animated.View key={i} style={[styles.waveBar, {
          height: bar.interpolate({ inputRange: [0, 1], outputRange: [4, 28] }),
          backgroundColor: active ? COLORS.primary : COLORS.textMuted,
        }]} />
      ))}
    </View>
  );
};

// ─── Face preview ────────────────────────────────────────────────────
const FacePreview = ({ cameraRef, isActive, stressLevel }) => {
  const cfg = STRESS_CONFIG[stressLevel] || STRESS_CONFIG.no_stress;
  if (!isActive) return null;
  return (
    <View style={styles.facePreviewWrap}>
      <Camera ref={cameraRef} style={styles.faceCamera} type={Camera.Constants.Type.front} ratio="1:1" />
      <View style={[styles.faceBorder, { borderColor: cfg.color }]} />
      <View style={styles.faceLabelWrap}>
        <Text style={[styles.faceLabel, { color: cfg.color }]}>{cfg.icon} {cfg.label}</Text>
      </View>
    </View>
  );
};

// ─── Sensor badge ────────────────────────────────────────────────────
const SensorBadge = ({ connected, bpm, zone }) => {
  const pulse = usePulse(connected && bpm != null, 800);
  return (
    <TouchableOpacity style={[styles.sensorBadge, connected && styles.sensorBadgeActive]}>
      <Animated.View style={[styles.sensorDot, {
        backgroundColor: connected ? COLORS.danger : COLORS.textMuted,
        transform: [{ scale: pulse }],
      }]} />
      <Text style={[styles.sensorText, { color: connected ? COLORS.textPrimary : COLORS.textMuted }]}>
        {connected && bpm ? `${Math.round(bpm)} bpm` : 'No sensor'}
      </Text>
    </TouchableOpacity>
  );
};

// ─── Main Screen ─────────────────────────────────────────────────────
export default function ChatScreen({ navigation }) {
  // Chat state
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [baselineStatus, setBaselineStatus] = useState({ is_ready: false, n_samples: 0 });

  // Input mode
  const [inputMode, setInputMode] = useState('text'); // 'text' | 'voice'

  // Voice
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');

  // Face / camera
  const [cameraPermission, setCameraPermission] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [faceStressLevel, setFaceStressLevel] = useState('no_stress');
  const [faceScanInterval, setFaceScanInterval] = useState(null);
  const cameraRef = useRef(null);

  // Sensor
  const [sensorConnected, setSensorConnected] = useState(false);
  const [sensorBpm, setSensorBpm] = useState(null);
  const [sensorZone, setSensorZone] = useState('unknown');

  // Fusion / stress overview
  const [fusedLabel, setFusedLabel] = useState('no_stress');
  const [fusedScore, setFusedScore] = useState(0);
  const [alert, setAlert] = useState(false);
  const [alertReasons, setAlertReasons] = useState([]);

  // Keystrokes
  const [keystrokes, setKeystrokes] = useState([]);
  const [typingStartTime, setTypingStartTime] = useState(null);
  const prevInputRef = useRef('');

  // UI state
  const [showStressPanel, setShowStressPanel] = useState(false);

  const flatListRef = useRef(null);
  const recordTimerRef = useRef(null);
  const sensorPollRef = useRef(null);
  const fusionPollRef = useRef(null);

  // ── Init ────────────────────────────────────────────────────────────
  useEffect(() => {
    initChat();
    checkCameraPermission();
    connectSensor();
    startPolling();
    return () => {
      stopPolling();
      stopFaceScanning();
    };
  }, []);

  const initChat = async () => {
    try {
      const session = await chatAPI.startSession();
      setSessionId(session.session_id);
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: "Hey 👋 I'm Mira, your wellbeing companion. How are you feeling today?",
        timestamp: new Date().toISOString(),
      }]);
      const status = await baselineAPI.getStatus();
      setBaselineStatus(status);
    } catch (e) {
      console.error('Init error', e);
    }
  };

  const checkCameraPermission = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    setCameraPermission(status === 'granted');
  };

  // ── Sensor ──────────────────────────────────────────────────────────
  const connectSensor = async () => {
    try {
      await sensorAPI.connect();
      setSensorConnected(true);
    } catch (e) {
      setSensorConnected(false);
    }
  };

  const startPolling = () => {
    sensorPollRef.current = setInterval(async () => {
      try {
        const status = await sensorAPI.getStatus();
        setSensorConnected(status.connected);
        setSensorBpm(status.latest_bpm);
        setSensorZone(status.bpm_zone);
      } catch (_) {}
    }, 2000);

    fusionPollRef.current = setInterval(async () => {
      if (!sessionId) return;
      try {
        const fusion = await chatAPI.getFusionStatus();
        setFusedLabel(fusion.fused_label || 'no_stress');
        setFusedScore(fusion.fused_score || 0);
        setAlert(fusion.alert || false);
        setAlertReasons(fusion.alert_reasons || []);
      } catch (_) {}
    }, 5000);
  };

  const stopPolling = () => {
    clearInterval(sensorPollRef.current);
    clearInterval(fusionPollRef.current);
  };

  // ── Face scanning ───────────────────────────────────────────────────
  const startFaceScanning = async () => {
    if (!cameraPermission) {
      Alert.alert('Camera Permission', 'Please allow camera access to enable face stress detection.');
      return;
    }
    setIsCameraActive(true);
    const interval = setInterval(async () => {
      if (!cameraRef.current) return;
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.4, base64: true, skipProcessing: true });
        const result = await faceAPI.detectStressFromBase64(photo.base64);
        setFaceStressLevel(result.stress_level || 'no_stress');
      } catch (_) {}
    }, 4000);
    setFaceScanInterval(interval);
  };

  const stopFaceScanning = () => {
    setIsCameraActive(false);
    if (faceScanInterval) clearInterval(faceScanInterval);
    setFaceScanInterval(null);
  };

  const toggleCamera = () => {
    if (isCameraActive) stopFaceScanning();
    else startFaceScanning();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ── Keystrokes ──────────────────────────────────────────────────────
  const handleInputChange = (text) => {
    const prev = prevInputRef.current;
    if (text.length > prev.length) {
      const now = Date.now();
      if (!typingStartTime) setTypingStartTime(now);
      setKeystrokes(ks => [...ks, { key: text[text.length - 1], ts_ms: now, type: 'down' }]);
    }
    prevInputRef.current = text;
    setInput(text);
  };

  const clearKeystrokes = () => {
    setKeystrokes([]);
    setTypingStartTime(null);
    prevInputRef.current = '';
  };

  // ── Voice recording ─────────────────────────────────────────────────
  const toggleRecording = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Mic Permission', 'Allow microphone access for voice input.'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync({
        android: { extension: '.wav', outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_MPEG_4, audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_AAC, sampleRate: 16000, numberOfChannels: 1, bitRate: 128000 },
        ios: { extension: '.wav', outputFormat: Audio.RECORDING_OPTION_IOS_OUTPUT_FORMAT_LINEARPCM, audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_HIGH, sampleRate: 16000, numberOfChannels: 1, bitRate: 128000, linearPCMBitDepth: 16, linearPCMIsBigEndian: false },
      });
      await rec.startAsync();
      setRecording(rec);
      setIsRecording(true);
      setRecordingSeconds(0);
      setLiveTranscript('Listening...');
      recordTimerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    } catch (e) {
      Alert.alert('Recording Error', e.message);
    }
  };

  const stopRecording = async () => {
    if (!recording || !isRecording) return;
    clearInterval(recordTimerRef.current);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      setIsRecording(false);
      setLiveTranscript('Processing...');
      await processAudio(uri);
    } catch (e) {
      setIsRecording(false);
      setRecording(null);
    }
  };

  const processAudio = async (uri) => {
    try {
      const result = await audioAPI.uploadAudio(uri);
      if (result.success) {
        setLiveTranscript(`"${result.transcript}"`);
        const msg = {
          id: Date.now(),
          role: 'assistant',
          content: `I heard: "${result.transcript}" — ${result.final_label === 1 ? 'I can sense some stress in your voice.' : 'You sound fairly calm.'}`,
          timestamp: new Date().toISOString(),
          meta: { stress_label: result.final_label, fused_label: result.final_label === 1 ? 'moderate' : 'no_stress' },
        };
        setMessages(prev => [...prev, msg]);
        setTimeout(() => setLiveTranscript(''), 4000);
      } else {
        setLiveTranscript('Could not process audio');
        setTimeout(() => setLiveTranscript(''), 3000);
      }
    } catch (e) {
      setLiveTranscript('Upload failed');
      setTimeout(() => setLiveTranscript(''), 3000);
    }
  };

  // ── Send text message ───────────────────────────────────────────────
  const sendMessage = async () => {
    if (!input.trim() || !sessionId || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMsg = {
      id: Date.now(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    const sentInput = input.trim();
    const sentKeystrokes = [...keystrokes];
    setInput('');
    clearKeystrokes();
    setLoading(true);

    try {
      const resp = await chatAPI.sendMessage(sessionId, sentInput, null, sentKeystrokes.length ? sentKeystrokes : undefined);
      const botMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        content: resp.reply,
        timestamp: new Date().toISOString(),
        meta: {
          stress_label: resp.stress_label,
          fused_label: resp.fused_label,
        },
      };
      setMessages(prev => [...prev, botMsg]);
      if (resp.fused_label) setFusedLabel(resp.fused_label);
      if (resp.fused_score != null) setFusedScore(resp.fused_score);
      if (resp.fusion_alert != null) setAlert(resp.fusion_alert);
    } catch (e) {
      setMessages(prev => [...prev, {
        id: Date.now() + 2,
        role: 'system',
        content: 'Message failed to send. Check your connection.',
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  // ── Sign out ────────────────────────────────────────────────────────
  const handleSignOut = () => {
    Alert.alert('Sign Out', 'End your session?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        await removeAuthToken();
        navigation.replace('SignIn');
      }},
    ]);
  };

  // ── Render ──────────────────────────────────────────────────────────
  const stressCfg = STRESS_CONFIG[fusedLabel] || STRESS_CONFIG.no_stress;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.mitraAvatar}>
            <Text style={styles.mitraAvatarText}>M</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>Mira</Text>
            <Text style={styles.headerSubtitle}>
              {baselineStatus.is_ready ? 'Personalised ✓' : `Learning (${baselineStatus.n_samples}/10)`}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <SensorBadge connected={sensorConnected} bpm={sensorBpm} zone={sensorZone} />
          <TouchableOpacity style={styles.headerIcon} onPress={() => setShowStressPanel(p => !p)}>
            <Text style={[styles.headerIconText, { color: stressCfg.color }]}>{stressCfg.icon}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon} onPress={handleSignOut}>
            <Text style={styles.headerIconText}>↗</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Stress panel (collapsible) ── */}
      {showStressPanel && (
        <View style={styles.stressPanel}>
          <View style={styles.stressPanelRow}>
            <StressRing level={fusedLabel} score={fusedScore} bpm={sensorBpm} />
            <View style={styles.signalGrid}>
              <SignalPill label="Text"  active={true}           color={COLORS.primary} />
              <SignalPill label="Voice" active={false}          color={COLORS.accent}  />
              <SignalPill label="Face"  active={isCameraActive} color={COLORS.amber}   />
              <SignalPill label="BPM"   active={sensorConnected && sensorBpm != null} color={COLORS.danger} />
            </View>
          </View>
          {alert && alertReasons.length > 0 && (
            <View style={styles.alertBanner}>
              <Text style={styles.alertText}>⚠ {alertReasons[0]}</Text>
            </View>
          )}
        </View>
      )}

      {/* ── Face preview ── */}
      {isCameraActive && (
        <FacePreview cameraRef={cameraRef} isActive={isCameraActive} stressLevel={faceStressLevel} />
      )}

      {/* ── Messages ── */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id.toString()}
          renderItem={({ item }) => <MessageBubble item={item} />}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={loading ? (
            <View style={[styles.bubbleRow, styles.bubbleRowBot]}>
              <View style={styles.avatarDot}><Text style={styles.avatarDotText}>M</Text></View>
              <View style={[styles.bubble, styles.bubbleBot, { paddingVertical: 14 }]}>
                <TypingDots />
              </View>
            </View>
          ) : null}
        />

        {/* ── Input bar ── */}
        <View style={styles.inputBar}>
          {/* Mode toggle */}
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeTab, inputMode === 'text'  && styles.modeTabActive]}
              onPress={() => { setInputMode('text');  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Text style={[styles.modeTabText, inputMode === 'text'  && { color: COLORS.primary }]}>Text</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeTab, inputMode === 'voice' && styles.modeTabActive]}
              onPress={() => { setInputMode('voice'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Text style={[styles.modeTabText, inputMode === 'voice' && { color: COLORS.primary }]}>Voice</Text>
            </TouchableOpacity>
            {/* Camera toggle */}
            <TouchableOpacity
              style={[styles.cameraToggle, isCameraActive && styles.cameraToggleActive]}
              onPress={toggleCamera}
            >
              <Text style={[styles.cameraToggleText, { color: isCameraActive ? COLORS.amber : COLORS.textMuted }]}>
                {isCameraActive ? '◉ Face' : '○ Face'}
              </Text>
            </TouchableOpacity>
            {/* Sensor reconnect */}
            {!sensorConnected && (
              <TouchableOpacity style={styles.sensorReconnect} onPress={connectSensor}>
                <Text style={styles.sensorReconnectText}>⊕ Sensor</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Text input */}
          {inputMode === 'text' && (
            <View style={styles.textRow}>
              <TextInput
                style={styles.textInput}
                placeholder="What's on your mind?"
                placeholderTextColor={COLORS.textMuted}
                value={input}
                onChangeText={handleInputChange}
                multiline
                maxLength={1000}
                returnKeyType="default"
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
                onPress={sendMessage}
                disabled={!input.trim() || loading}
              >
                {loading
                  ? <ActivityIndicator size="small" color={COLORS.textPrimary} />
                  : <Text style={styles.sendBtnText}>↑</Text>
                }
              </TouchableOpacity>
            </View>
          )}

          {/* Voice input */}
          {inputMode === 'voice' && (
            <View style={styles.voiceRow}>
              <VoiceWave active={isRecording} />
              <TouchableOpacity
                style={[styles.recordBtn, isRecording && styles.recordBtnActive]}
                onPress={toggleRecording}
              >
                <Text style={styles.recordBtnText}>
                  {isRecording ? `■ ${recordingSeconds}s` : '● Tap to speak'}
                </Text>
              </TouchableOpacity>
              {liveTranscript !== '' && (
                <Text style={styles.transcript} numberOfLines={2}>{liveTranscript}</Text>
              )}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 56 : 36, paddingBottom: 12,
    paddingHorizontal: 18, backgroundColor: COLORS.bg,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mitraAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: COLORS.primaryDim,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: COLORS.primary + '60',
  },
  mitraAvatarText: { color: COLORS.primary, fontWeight: '600', fontSize: 16 },
  headerTitle: { color: COLORS.textPrimary, fontSize: 17, fontWeight: '600', letterSpacing: 0.2 },
  headerSubtitle: { color: COLORS.textMuted, fontSize: 11, marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIcon: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: COLORS.surface, borderWidth: 0.5, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerIconText: { color: COLORS.textSecond, fontSize: 16 },

  // Sensor badge
  sensorBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    backgroundColor: COLORS.surface, borderWidth: 0.5, borderColor: COLORS.border,
  },
  sensorBadgeActive: { borderColor: COLORS.danger + '50', backgroundColor: COLORS.dangerDim + '60' },
  sensorDot: { width: 6, height: 6, borderRadius: 3 },
  sensorText: { fontSize: 11, fontWeight: '500' },

  // Stress panel
  stressPanel: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
    paddingHorizontal: 18, paddingVertical: 12,
  },
  stressPanelRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stressRingWrap: { alignItems: 'center', justifyContent: 'center' },
  stressRingOuter: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  stressRingInner: {
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
  },
  stressRingIcon: { fontSize: 18, lineHeight: 20 },
  stressRingLabel: { fontSize: 9, fontWeight: '600', marginTop: 1, textTransform: 'uppercase', letterSpacing: 0.5 },
  stressRingBpm: { fontSize: 9, color: COLORS.textMuted, marginTop: 1 },
  signalGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  signalPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12,
    backgroundColor: COLORS.surfaceHigh, borderWidth: 0.5, borderColor: COLORS.border,
  },
  signalDot: { width: 5, height: 5, borderRadius: 3 },
  signalLabel: { fontSize: 10, fontWeight: '500' },
  alertBanner: {
    marginTop: 8, backgroundColor: COLORS.dangerDim,
    borderRadius: 8, padding: 8, borderWidth: 0.5, borderColor: COLORS.danger + '40',
  },
  alertText: { color: COLORS.danger, fontSize: 12, fontWeight: '500' },

  // Face
  facePreviewWrap: {
    position: 'absolute', top: Platform.OS === 'ios' ? 110 : 90, right: 14,
    width: 80, height: 80, borderRadius: 12, overflow: 'hidden', zIndex: 10,
  },
  faceCamera: { width: 80, height: 80 },
  faceBorder: { position: 'absolute', inset: 0, borderRadius: 12, borderWidth: 2 },
  faceLabelWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 2, alignItems: 'center',
  },
  faceLabel: { fontSize: 9, fontWeight: '600' },

  // Messages
  messagesList: { padding: 16, paddingBottom: 4 },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 4, gap: 8 },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubbleRowBot: { justifyContent: 'flex-start' },
  avatarDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.primaryDim,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarDotText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  bubble: {
    maxWidth: SCREEN_WIDTH * 0.72, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10,
  },
  bubbleUser: {
    backgroundColor: COLORS.userBubble,
    borderBottomRightRadius: 4,
  },
  bubbleBot: {
    backgroundColor: COLORS.botBubble,
    borderBottomLeftRadius: 4,
    borderWidth: 0.5, borderColor: COLORS.border,
  },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  bubbleTextUser: { color: '#fff' },
  bubbleTextBot: { color: COLORS.textPrimary },
  bubbleMeta: { flexDirection: 'row', gap: 8, marginTop: 6 },
  bubbleMetaText: { fontSize: 11, fontWeight: '500' },
  bubbleTime: { fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 4, textAlign: 'right' },
  systemMsg: {
    alignSelf: 'center', marginVertical: 6,
    backgroundColor: COLORS.surfaceHigh, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 0.5, borderColor: COLORS.border,
  },
  systemMsgText: { color: COLORS.textMuted, fontSize: 11 },

  // Typing indicator
  typingContainer: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 },
  typingDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: COLORS.textMuted,
  },

  // Input bar
  inputBar: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 0.5, borderTopColor: COLORS.border,
    paddingHorizontal: 14, paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
  },
  modeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10,
  },
  modeTab: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: COLORS.surfaceHigh, borderWidth: 0.5, borderColor: COLORS.border,
  },
  modeTabActive: { borderColor: COLORS.primary + '60', backgroundColor: COLORS.primaryDim + '60' },
  modeTabText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '500' },
  cameraToggle: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: COLORS.surfaceHigh, borderWidth: 0.5, borderColor: COLORS.border,
    marginLeft: 'auto',
  },
  cameraToggleActive: { borderColor: COLORS.amber + '60', backgroundColor: COLORS.amberDim + '60' },
  cameraToggleText: { fontSize: 12, fontWeight: '500' },
  sensorReconnect: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
    borderWidth: 0.5, borderColor: COLORS.accent + '50',
  },
  sensorReconnectText: { color: COLORS.accent, fontSize: 11, fontWeight: '500' },

  // Text input row
  textRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  textInput: {
    flex: 1, minHeight: 44, maxHeight: 120,
    backgroundColor: COLORS.surfaceHigh, borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 11,
    color: COLORS.textPrimary, fontSize: 15, lineHeight: 22,
    borderWidth: 0.5, borderColor: COLORS.border,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: COLORS.primaryDim + '80' },
  sendBtnText: { color: '#fff', fontSize: 20, fontWeight: '600', lineHeight: 24 },

  // Voice row
  voiceRow: { alignItems: 'center', gap: 12 },
  waveWrap: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 32 },
  waveBar: { width: 3, borderRadius: 2 },
  recordBtn: {
    paddingHorizontal: 32, paddingVertical: 12, borderRadius: 28,
    backgroundColor: COLORS.surfaceHigh,
    borderWidth: 1.5, borderColor: COLORS.primary + '60',
  },
  recordBtnActive: { backgroundColor: COLORS.dangerDim, borderColor: COLORS.danger },
  recordBtnText: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' },
  transcript: {
    color: COLORS.textSecond, fontSize: 13, textAlign: 'center',
    paddingHorizontal: 12, lineHeight: 18,
  },
});
