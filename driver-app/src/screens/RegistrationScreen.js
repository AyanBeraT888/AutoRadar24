/**
 * Auto 24 Driver App - Registration Screen
 * Driver fills initial details (name, phone, vehicle number).
 */

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import colors from '../theme/colors';
import typography from '../theme/typography';
import { getOrCreateDeviceId, saveDriverProfile } from '../services/storage';
import { registerDriverApi, getApiBaseUrl, setApiBaseUrl } from '../services/api';

export default function RegistrationScreen({ onRegistered }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [serverUrl, setServerUrl] = useState(getApiBaseUrl());
  const [showConfig, setShowConfig] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    getOrCreateDeviceId().then(setDeviceId);
  }, []);

  const handleRegister = async () => {
    if (!name.trim() || !phone.trim() || !vehicleNo.trim()) {
      Alert.alert('Required Fields', 'Please enter your full name, phone number, and vehicle number.');
      return;
    }

    setIsSubmitting(true);
    try {
      setApiBaseUrl(serverUrl);

      const response = await registerDriverApi({
        name: name.trim(),
        phone: phone.trim(),
        vehicle_no: vehicleNo.trim().toUpperCase(),
        device_id: deviceId,
      });

      const profile = {
        ...response.driver,
        device_id: deviceId,
      };

      await saveDriverProfile(profile);
      onRegistered(profile);
    } catch (err) {
      Alert.alert('Registration Failed', err.message || 'Could not connect to backend server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Header Branding */}
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoText}>24</Text>
          </View>
          <Text style={styles.brandTitle}>Auto 24</Text>
          <Text style={styles.tagline}>Driver Location Broadcast</Text>
        </View>

        {/* Registration Form */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Driver Registration</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>FULL NAME</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Ramesh Kumar"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>PHONE NUMBER</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. +91 98765 43210"
              placeholderTextColor={colors.textMuted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>VEHICLE NUMBER</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. KA-04-E-2024"
              placeholderTextColor={colors.textMuted}
              value={vehicleNo}
              onChangeText={(text) => setVehicleNo(text.toUpperCase())}
              autoCapitalize="characters"
            />
          </View>

          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleRegister}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>Submit Registration</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Device & Server Config Section */}
        <View style={styles.infoSection}>
          <Text style={styles.deviceIdLabel}>DEVICE ID</Text>
          <Text style={styles.deviceIdValue}>{deviceId || 'Generating...'}</Text>

          <TouchableOpacity
            onPress={() => setShowConfig(!showConfig)}
            style={styles.configToggle}
          >
            <Text style={styles.configToggleText}>
              {showConfig ? 'Hide Server Settings' : 'Configure Backend Server'}
            </Text>
          </TouchableOpacity>

          {showConfig && (
            <View style={styles.configBox}>
              <Text style={styles.configBoxLabel}>Backend Host URL:</Text>
              <TextInput
                style={styles.configInput}
                value={serverUrl}
                onChangeText={setServerUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.configHelp}>
                Default: 10.0.2.2:3000 for Android Emulator. Use LAN IP (e.g. http://192.168.1.5:3000) for real phone.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoBadge: {
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: colors.brandPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  logoText: {
    ...typography.titleLarge,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  brandTitle: {
    ...typography.titleLarge,
    color: colors.textPrimary,
  },
  tagline: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    marginTop: 4,
  },
  formCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  formTitle: {
    ...typography.titleMedium,
    color: colors.textPrimary,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 18,
  },
  inputLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.textPrimary,
    fontSize: 16,
  },
  submitButton: {
    backgroundColor: colors.buttonPrimary,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    ...typography.bodyLarge,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  infoSection: {
    alignItems: 'center',
    marginTop: 28,
  },
  deviceIdLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  deviceIdValue: {
    ...typography.mono,
    color: colors.textSecondary,
    marginTop: 2,
  },
  configToggle: {
    marginTop: 16,
    padding: 8,
  },
  configToggleText: {
    ...typography.bodyMedium,
    color: colors.brandLight,
    textDecorationLine: 'underline',
  },
  configBox: {
    width: '100%',
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginTop: 10,
  },
  configBoxLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  configInput: {
    backgroundColor: colors.inputBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    color: colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 6,
    ...typography.mono,
  },
  configHelp: {
    ...typography.bodyMedium,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 6,
    lineHeight: 15,
  },
});
