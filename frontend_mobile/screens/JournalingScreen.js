import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const JournalingScreen = ({ navigation }) => {
  const [entries, setEntries] = useState([
    {
      id: 1,
      date: '2024-04-14',
      time: '10:30 AM',
      mood: 'happy',
      title: 'Morning Reflection',
      content: 'Had a great morning workout and feeling energized for the day ahead.',
      tags: ['exercise', 'morning', 'energy'],
    },
    {
      id: 2,
      date: '2024-04-13',
      time: '8:45 PM',
      mood: 'neutral',
      title: 'Evening Thoughts',
      content: 'Work was challenging today but I managed to complete the project.',
      tags: ['work', 'challenge', 'achievement'],
    },
  ]);

  const [showNewEntry, setShowNewEntry] = useState(false);
  const [newEntry, setNewEntry] = useState({
    title: '',
    content: '',
    mood: 'neutral',
    tags: '',
  });

  const moods = [
    { emoji: '😊', label: 'Happy', value: 'happy', color: '#4CAF50' },
    { emoji: '😐', label: 'Neutral', value: 'neutral', color: '#FFC107' },
    { emoji: '😔', label: 'Sad', value: 'sad', color: '#FF9800' },
    { emoji: '😄', label: 'Excited', value: 'excited', color: '#6B46C1' },
    { emoji: '😰', label: 'Anxious', value: 'anxious', color: '#F44336' },
  ];

  const journalPrompts = [
    "What made you smile today?",
    "What are you grateful for right now?",
    "Describe a challenge you overcame today.",
    "What's something you learned about yourself?",
    "How did you take care of yourself today?",
    "What are you looking forward to?",
  ];

  const saveEntry = () => {
    if (!newEntry.title.trim() || !newEntry.content.trim()) {
      Alert.alert('Error', 'Please fill in both title and content');
      return;
    }

    const entry = {
      id: entries.length + 1,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      mood: newEntry.mood,
      title: newEntry.title,
      content: newEntry.content,
      tags: newEntry.tags.split(',').map(tag => tag.trim()).filter(tag => tag),
    };

    setEntries([entry, ...entries]);
    setNewEntry({ title: '', content: '', mood: 'neutral', tags: '' });
    setShowNewEntry(false);
    Alert.alert('Success', 'Journal entry saved successfully!');
  };

  const getRandomPrompt = () => {
    return journalPrompts[Math.floor(Math.random() * journalPrompts.length)];
  };

  const getMoodEmoji = (mood) => {
    const moodObj = moods.find(m => m.value === mood);
    return moodObj ? moodObj.emoji : '😐';
  };

  const getMoodColor = (mood) => {
    const moodObj = moods.find(m => m.value === mood);
    return moodObj ? moodObj.color : '#FFC107';
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['#6B46C1', '#9333EA']}
        style={styles.header}
      >
        <Text style={styles.title}>Journaling</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowNewEntry(true)}
        >
          <Ionicons name="add" size={24} color="white" />
        </TouchableOpacity>
      </LinearGradient>

      {/* Daily Prompt */}
      <View style={styles.promptContainer}>
        <Text style={styles.promptTitle}>Today's Prompt</Text>
        <Text style={styles.promptText}>"{getRandomPrompt()}"</Text>
      </View>

      {/* Journal Entries */}
      <ScrollView style={styles.entriesContainer} showsVerticalScrollIndicator={false}>
        {entries.map((entry) => (
          <TouchableOpacity
            key={entry.id}
            style={styles.entryCard}
            onPress={() => {
              // Navigate to entry details
            }}
          >
            <View style={styles.entryHeader}>
              <View style={styles.entryMeta}>
                <Text style={styles.entryDate}>{entry.date}</Text>
                <Text style={styles.entryTime}>{entry.time}</Text>
              </View>
              <Text style={styles.entryMood}>
                {getMoodEmoji(entry.mood)}
              </Text>
            </View>
            <Text style={styles.entryTitle}>{entry.title}</Text>
            <Text style={styles.entryContent} numberOfLines={3}>
              {entry.content}
            </Text>
            {entry.tags.length > 0 && (
              <View style={styles.tagsContainer}>
                {entry.tags.map((tag, index) => (
                  <View key={index} style={styles.tag}>
                    <Text style={styles.tagText}>#{tag}</Text>
                  </View>
                ))}
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* New Entry Modal */}
      <Modal
        visible={showNewEntry}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <LinearGradient
            colors={['#6B46C1', '#9333EA']}
            style={styles.modalHeader}
          >
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowNewEntry(false)}
            >
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Entry</Text>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={saveEntry}
            >
              <Ionicons name="checkmark" size={24} color="white" />
            </TouchableOpacity>
          </LinearGradient>

          <ScrollView style={styles.modalContent}>
            <Text style={styles.inputLabel}>Title</Text>
            <TextInput
              style={styles.titleInput}
              value={newEntry.title}
              onChangeText={(text) => setNewEntry({ ...newEntry, title: text })}
              placeholder="Give your entry a title..."
              placeholderTextColor="#9CA3AF"
            />

            <Text style={styles.inputLabel}>How are you feeling?</Text>
            <View style={styles.moodSelector}>
              {moods.map((mood) => (
                <TouchableOpacity
                  key={mood.value}
                  style={[
                    styles.moodOption,
                    newEntry.mood === mood.value && {
                      backgroundColor: mood.color,
                      borderColor: mood.color,
                    }
                  ]}
                  onPress={() => setNewEntry({ ...newEntry, mood: mood.value })}
                >
                  <Text style={styles.moodEmoji}>{mood.emoji}</Text>
                  <Text style={[
                    styles.moodLabel,
                    newEntry.mood === mood.value && { color: 'white' }
                  ]}>
                    {mood.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Your thoughts</Text>
            <TextInput
              style={styles.contentInput}
              value={newEntry.content}
              onChangeText={(text) => setNewEntry({ ...newEntry, content: text })}
              placeholder="Write about your day, feelings, thoughts..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={8}
              textAlignVertical="top"
            />

            <Text style={styles.inputLabel}>Tags (comma separated)</Text>
            <TextInput
              style={styles.tagsInput}
              value={newEntry.tags}
              onChangeText={(text) => setNewEntry({ ...newEntry, tags: text })}
              placeholder="work, family, exercise, gratitude..."
              placeholderTextColor="#9CA3AF"
            />
          </ScrollView>
        </View>
      </Modal>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
  },
  addButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  promptContainer: {
    backgroundColor: 'white',
    margin: 16,
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  promptTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B46C1',
    marginBottom: 8,
  },
  promptText: {
    fontSize: 14,
    color: '#4B5563',
    fontStyle: 'italic',
    lineHeight: 20,
  },
  entriesContainer: {
    flex: 1,
    padding: 16,
  },
  entryCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  entryMeta: {
    flex: 1,
  },
  entryDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  entryTime: {
    fontSize: 12,
    color: '#6B7280',
  },
  entryMood: {
    fontSize: 24,
  },
  entryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  entryContent: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
    marginBottom: 12,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tag: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 4,
  },
  tagText: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '500',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  modalHeader: {
    paddingTop: 60,
    padding: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  saveButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  titleInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 20,
  },
  moodSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  moodOption: {
    width: '30%',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  moodEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  moodLabel: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '500',
  },
  contentInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 20,
    height: 120,
  },
  tagsInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 20,
  },
});

export default JournalingScreen;
