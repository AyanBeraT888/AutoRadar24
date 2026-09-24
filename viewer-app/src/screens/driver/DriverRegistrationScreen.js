/**
 * Auto 24 Driver Mode - Registration Screen
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
import colors from '../../theme/colors';
import typography from '../../theme/typography';
import { getOrCreateDeviceId, saveDriverProfile } from '../../services/storage';
import { registerDriverApi } from '../../services/driverApi';

export default function DriverRegistrationScreen({ onRegistered, onOpenMenu }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [deviceId, setDeviceId] = useState('');
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
        {/* Top Header with Menu Button */}
        <View style={styles.topHeader}>
          <TouchableOpacity style={styles.menuBtn} onPress={onOpenMenu} activeOpacity={0.7}>
            <Text style={styles.menuIcon}>☰</Text>
          </TouchableOpacity>
          <View style={styles.headerTitleBox}>
            <Text style={styles.brandTitle}>AutoRadar18</Text>
            <Text style={styles.tagline}>Driver Console</Text>
          </View>
          <View style={styles.menuBtnPlaceholder} />
        </View>

        {/* Registration Form Card */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Driver Registration</Text>
          <Text style={styles.formSubtitle}>
            Register your vehicle to broadcast your live location on the AutoRadar18 radar network.
          </Text>

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
              placeholder="e.g. 9876543210"
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
              placeholder="e.g. WB 02 AB 1234"
              placeholderTextColor={colors.textMuted}
              value={vehicleNo}
              onChangeText={setVehicleNo}
              autoCapitalize="characters"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>DEVICE IDENTIFIER (AUTO-GENERATED)</Text>
            <Text style={styles.deviceIdText} numberOfLines={1} ellipsizeMode="middle">
              {deviceId || 'Generating hardware ID...'}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleRegister}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#0D1117" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>Submit Registration</Text>
            )}
          </TouchableOpacity>
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
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 44 : 20,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  menuBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuIcon: {
    color: colors.brandGold,
    fontSize: 22,
    fontWeight: '700',
  },
  menuBtnPlaceholder: {
    width: 44,
  },
  headerTitleBox: {
    alignItems: 'center',
  },
  brandTitle: {
    ...typography.titleLarge,
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  tagline: {
    ...typography.caption,
    color: colors.brandGold,
    marginTop: 2,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  formTitle: {
    ...typography.titleMedium,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  formSubtitle: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    marginBottom: 20,
    lineHeight: 18,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.cardBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    fontSize: 15,
  },
  deviceIdText: {
    ...typography.mono,
    color: colors.textMuted,
    backgroundColor: colors.cardBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  submitButton: {
    backgroundColor: colors.brandGold,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#0D1117',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
