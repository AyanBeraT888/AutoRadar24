/**
 * Auto 24 Driver App - Pending Approval Screen
 * Displays waiting status and periodically polls backend for approval.
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from 'react-native';
import colors from '../theme/colors';
import typography from '../theme/typography';
import { getRegistrationStatusApi } from '../services/api';
import { saveStatus, clearSession } from '../services/storage';

export default function PendingScreen({ profile, onApproved, onReset }) {
  const [pollCount, setPollCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for waiting indicator
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.25,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  // Polling loop
  useEffect(() => {
    let isMounted = true;
    let timerId = null;

    async function checkStatus() {
      try {
        const res = await getRegistrationStatusApi(profile.device_id);
        if (!isMounted) return;

        setPollCount((c) => c + 1);
        setErrorMessage(null);

        if (res.status === 'approved') {
          await saveStatus('approved');
          onApproved(res);
          return;
        } else if (res.status === 'rejected') {
          await saveStatus('rejected');
          setErrorMessage('Registration was rejected by administration.');
          return;
        }
      } catch (err) {
        if (!isMounted) return;
        setErrorMessage('Connecting to server...');
      }

      // Poll again after 4 seconds
      if (isMounted) {
        timerId = setTimeout(checkStatus, 4000);
      }
    }

    checkStatus();

    return () => {
      isMounted = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [profile.device_id, onApproved]);

  const handleReset = async () => {
    await clearSession();
    onReset();
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Animated Status Beacon */}
        <View style={styles.beaconContainer}>
          <Animated.View
            style={[
              styles.pulseRing,
              {
                transform: [{ scale: pulseAnim }],
              },
            ]}
          />
          <View style={styles.beaconCore}>
            <ActivityIndicator color={colors.pending} size="small" />
          </View>
        </View>

        {/* Status Text */}
        <Text style={styles.statusTitle}>Waiting for approval</Text>
        <Text style={styles.statusDescription}>
          Your vehicle registration has been submitted. Tracking will activate automatically once approved.
        </Text>

        {/* Driver Profile Card */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>DRIVER</Text>
            <Text style={styles.cardValue}>{profile.name || 'Driver'}</Text>
          </View>
          <View style={styles.cardDivider} />
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>VEHICLE NO</Text>
            <Text style={styles.cardValue}>{profile.vehicle_no || 'Pending'}</Text>
          </View>
          <View style={styles.cardDivider} />
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>DEVICE ID</Text>
            <Text style={styles.monoValue} numberOfLines={1} ellipsizeMode="middle">
              {profile.device_id}
            </Text>
          </View>
          <View style={styles.cardDivider} />
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>STATUS</Text>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>PENDING</Text>
            </View>
          </View>
        </View>

        {/* Polling Indicator */}
        <View style={styles.pollStatus}>
          <Text style={styles.pollText}>
            {errorMessage || `Polling verification server (${pollCount})`}
          </Text>
        </View>

        {/* Action Button */}
        <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
          <Text style={styles.resetButtonText}>Edit Registration Details</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  content: {
    alignItems: 'center',
  },
  beaconContainer: {
    width: 90,
    height: 90,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  pulseRing: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: colors.pendingGlow,
    borderWidth: 1.5,
    borderColor: colors.pending,
  },
  beaconCore: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.pending,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusTitle: {
    ...typography.titleLarge,
    color: colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  statusDescription: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 28,
    paddingHorizontal: 12,
  },
  card: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 18,
    marginBottom: 20,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  cardDivider: {
    height: 1,
    backgroundColor: colors.cardBorder,
  },
  cardLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  cardValue: {
    ...typography.bodyLarge,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  monoValue: {
    ...typography.mono,
    color: colors.textSecondary,
    maxWidth: '65%',
  },
  statusBadge: {
    backgroundColor: colors.pendingGlow,
    borderWidth: 1,
    borderColor: colors.pending,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusBadgeText: {
    ...typography.caption,
    color: colors.pending,
    fontWeight: '700',
  },
  pollStatus: {
    marginBottom: 24,
  },
  pollText: {
    ...typography.bodyMedium,
    fontSize: 13,
    color: colors.textMuted,
  },
  resetButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  resetButtonText: {
    ...typography.bodyMedium,
    color: colors.brandLight,
    textDecorationLine: 'underline',
  },
});
