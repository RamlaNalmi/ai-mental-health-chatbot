import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const EmergencyScreen = ({ navigation }) => {
  const emergencyContacts = [
    { name: 'National Crisis Line', number: '988', description: '24/7 crisis support' },
    { name: 'Suicide Prevention Hotline', number: '988', description: 'Immediate help available' },
    { name: 'Local Emergency', number: '911', description: 'For immediate danger' },
    { name: 'Mental Health Helpline', number: '1-800-273-8255', description: 'Professional support' },
  ];

  const makeCall = (number) => {
    Linking.openURL(`tel:${number}`);
  };

  const openWebsite = (url) => {
    Linking.openURL(url);
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <LinearGradient
        colors={['#DC2626', '#B91C1C']}
        style={styles.header}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Emergency Support</Text>
      </LinearGradient>

      {/* Warning Message */}
      <View style={styles.warningContainer}>
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>⚠️ Important</Text>
          <Text style={styles.warningText}>
            If you are in immediate danger or having thoughts of harming yourself, please call emergency services right away.
          </Text>
          <Text style={styles.warningText}>
            Your safety is the most important priority.
          </Text>
        </View>
      </View>

      {/* Emergency Contacts */}
      <View style={styles.contactsContainer}>
        <Text style={styles.sectionTitle}>Emergency Contacts</Text>
        {emergencyContacts.map((contact, index) => (
          <TouchableOpacity
            key={index}
            style={styles.contactCard}
            onPress={() => makeCall(contact.number)}
          >
            <View style={styles.contactInfo}>
              <Text style={styles.contactName}>{contact.name}</Text>
              <Text style={styles.contactNumber}>{contact.number}</Text>
            </View>
            <Text style={styles.contactDescription}>{contact.description}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Mental Health Resources */}
      <View style={styles.resourcesContainer}>
        <Text style={styles.sectionTitle}>Mental Health Resources</Text>
        
        <TouchableOpacity
          style={styles.resourceCard}
          onPress={() => openWebsite('https://www.nami.org')}
        >
          <Text style={styles.resourceTitle}>NAMI</Text>
          <Text style={styles.resourceDescription}>National Alliance on Mental Illness</Text>
          <Text style={styles.resourceLink}>nami.org →</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.resourceCard}
          onPress={() => openWebsite('https://www.crisistextline.org')}
        >
          <Text style={styles.resourceTitle}>Crisis Text Line</Text>
          <Text style={styles.resourceDescription}>Text HOME to 741741 from anywhere</Text>
          <Text style={styles.resourceLink}>crisistextline.org →</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.resourceCard}
          onPress={() => openWebsite('https://www.mentalhealth.gov')}
        >
          <Text style={styles.resourceTitle}>Mental Health.gov</Text>
          <Text style={styles.resourceDescription}>US government mental health resources</Text>
          <Text style={styles.resourceLink}>mentalhealth.gov →</Text>
        </TouchableOpacity>
      </View>

      {/* Disclaimers */}
      <View style={styles.disclaimerContainer}>
        <Text style={styles.disclaimerTitle}>Disclaimer</Text>
        <Text style={styles.disclaimerText}>
          This app is not a substitute for professional mental health care. If you are experiencing a mental health emergency, please contact a qualified healthcare provider or emergency services immediately.
        </Text>
      </View>
    </ScrollView>
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
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 20,
    zIndex: 1,
  },
  backText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginBottom: 20,
  },
  warningContainer: {
    margin: 16,
  },
  warningBox: {
    backgroundColor: '#FEF2F2',
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    padding: 16,
    borderRadius: 8,
  shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  warningTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#D97706',
    marginBottom: 8,
  },
  warningText: {
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
  },
  contactsContainer: {
    margin: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  contactCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  contactInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },
  contactNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  contactDescription: {
    fontSize: 12,
    color: '#6B7280',
    flex: 1,
    textAlign: 'right',
  },
  resourcesContainer: {
    margin: 16,
  },
  resourceCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  resourceTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  resourceDescription: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  resourceLink: {
    fontSize: 12,
    color: '#6B46C1',
    fontWeight: '500',
  },
  disclaimerContainer: {
    margin: 16,
    padding: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  disclaimerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 8,
  },
  disclaimerText: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
  },
});

export default EmergencyScreen;
