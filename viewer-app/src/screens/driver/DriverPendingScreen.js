/**
 * Auto 24 Driver Mode - Pending Approval Screen
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
  Platform,
} from 'react-native';
import colors from '../../theme/colors';
import typography from '../../theme/typography';
import { getRegistrationStatusApi } from '../../services/driverApi';
import { saveStatus, clearDriverSession } from '../../services/storage';

export default function DriverPendingScreen({ profile, onApproved, onReset, onOpenMenu }) {
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
      } catch {
        if (!isMounted) return;
        setErrorMessage('Connecting to verification server...');
      }

      if (isMounted) {
        timerId = setTimeout(checkStatus, 4000);
      }
    }

    checkStatus();

    return () => {
      isMounted = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [profile?.device_id, onApproved]);

  const handleReset = async () => {
    await clearDriverSession();
    onReset();
  };

  return (
    <View style={styles.container}>
      {/* Top Header with Menu Button */}
      <View style={styles.topHeader}>
        <TouchableOpacity style={styles.menuBtn} onPress={onOpenMenu} activeOpacity={0.7}>
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleBox}>
          <Text style={styles.brandTitle}>Auto 24</Text>
          <Text style={styles.tagline}>Verification Status</Text>
        </View>
        <View style={styles.menuBtnPlaceholder} />
      </View>

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
        <Text style={styles.statusTitle}>Waiting for Approval</Text>
        <Text style={styles.statusDescription}>
          Your vehicle registration has been submitted. Tracking will activate automatically once verified.
        </Text>

        {/* Driver Profile Card */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>DRIVER</Text>
            <Text style={styles.cardValue}>{profile?.name || 'Driver'}</Text>
          </View>
          <View style={styles.cardDivider} />
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>VEHICLE NO</Text>
            <Text style={styles.cardValue}>{profile?.vehicle_no || 'Pending'}</Text>
          </View>
          <View style={styles.cardDivider} />
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>DEVICE ID</Text>
            <Text style={styles.monoValue} numberOfLines={1} ellipsizeMode="middle">
              {profile?.device_id}
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
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 44 : 20,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
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
  },
  tagline: {
    ...typography.caption,
    color: colors.brandGold,
    marginTop: 2,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  beaconContainer: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  pulseRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.pendingGlow,
    borderWidth: 1.5,
    borderColor: colors.pending,
  },
  beaconCore: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.pending,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusTitle: {
    ...typography.titleLarge,
    color: colors.textPrimary,
    marginBottom: 6,
    textAlign: 'center',
  },
  statusDescription: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
    maxWidth: 320,
    lineHeight: 18,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    width: '100%',
    padding: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
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
    color: colors.textSecondary,
  },
  cardValue: {
    ...typography.bodyLarge,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  monoValue: {
    ...typography.mono,
    color: colors.textMuted,
    maxWidth: 180,
  },
  statusBadge: {
    backgroundColor: colors.pendingGlow,
    borderColor: colors.pending,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeText: {
    ...typography.caption,
    color: colors.pending,
    fontWeight: '700',
  },
  pollStatus: {
    marginVertical: 16,
  },
  pollText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  resetButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
  },
  resetButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
});
