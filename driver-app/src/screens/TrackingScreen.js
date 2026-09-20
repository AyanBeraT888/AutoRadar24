/**
 * Auto 24 Driver App - Active Tracking Screen
 * Live status dashboard with foreground service indicator and GPS metrics.
 */

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import colors from '../theme/colors';
import typography from '../theme/typography';
import {
  startTracking,
  stopTracking,
  subscribeToLocationUpdates,
} from '../services/locationTask';
import { clearSession } from '../services/storage';

export default function TrackingScreen({ profile, onLogOut }) {
  const [isTracking, setIsTracking] = useState(true);
  const [movingStatus, setMovingStatus] = useState('idle'); // 'moving' | 'idle'
  const [coords, setCoords] = useState(null);
  const [lastSent, setLastSent] = useState(null);
  const [updateCount, setUpdateCount] = useState(0);
  const [lastError, setLastError] = useState(null);

  // Initialize and start background location tracking
  useEffect(() => {
    let mounted = true;

    async function initTracking() {
      try {
        await startTracking();
        if (mounted) setIsTracking(true);
      } catch (err) {
        if (mounted) {
          setLastError(err.message);
          Alert.alert('Permission Error', err.message);
        }
      }
    }

    initTracking();

    // Subscribe to live location task updates
    const unsubscribe = subscribeToLocationUpdates((data) => {
      if (!mounted) return;

      if (data.error) {
        setLastError(data.error);
      } else {
        setLastError(null);
        setCoords({ lat: data.lat, lng: data.lng, speed: data.speed });
        if (data.moving_status) {
          setMovingStatus(data.moving_status);
        }
        setLastSent(new Date(data.last_updated || Date.now()));
        setUpdateCount((c) => c + 1);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // Toggle Tracking on/off
  const handleToggleTracking = async () => {
    try {
      if (isTracking) {
        await stopTracking();
        setIsTracking(false);
        setMovingStatus('idle');
      } else {
        await startTracking();
        setIsTracking(true);
      }
    } catch (err) {
      Alert.alert('Tracking Error', err.message);
    }
  };

  const handleLogOut = () => {
    Alert.alert(
      'Stop & Log Off',
      'This will disconnect tracking and clear your device profile.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Off',
          style: 'destructive',
          onPress: async () => {
            await stopTracking();
            await clearSession();
            onLogOut();
          },
        },
      ]
    );
  };

  const isMoving = movingStatus === 'moving';
  const statusColor = !isTracking
    ? colors.textMuted
    : isMoving
    ? colors.moving
    : colors.idle;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <View>
            <Text style={styles.brandTitle}>Auto 24</Text>
            <Text style={styles.vehicleNo}>{profile.vehicle_no}</Text>
          </View>
          <View style={[styles.dutyBadge, { borderColor: statusColor }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.dutyText, { color: statusColor }]}>
              {!isTracking ? 'PAUSED' : isMoving ? 'MOVING' : 'IDLE'}
            </Text>
          </View>
        </View>

        {/* Foreground Service Notice Card */}
        <View style={styles.serviceNotice}>
          <Text style={styles.serviceNoticeTitle}>FOREGROUND SERVICE ACTIVE</Text>
          <Text style={styles.serviceNoticeBody}>
            Continuous background broadcast enabled. A persistent notification is visible in your Android system tray.
          </Text>
        </View>

        {/* Main Status Hero Card */}
        <View style={[styles.statusCard, { borderColor: statusColor }]}>
          <View
            style={[
              styles.indicatorRing,
              {
                backgroundColor: isMoving ? colors.movingGlow : colors.idleGlow,
                borderColor: statusColor,
              },
            ]}
          >
            <View style={[styles.indicatorCore, { backgroundColor: statusColor }]} />
          </View>

          <Text style={styles.statusHeadline}>
            {!isTracking ? 'Tracking Paused' : isMoving ? 'Tracking Active' : 'Driver Idle'}
          </Text>
          <Text style={styles.statusSubline}>
            {!isTracking
              ? 'Broadcasting is currently paused by driver.'
              : isMoving
              ? 'Vehicle in motion — broadcasting live location.'
              : 'Negligible movement or waiting at standstill.'}
          </Text>

          {/* Quick Metrics */}
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>TRANSMISSIONS</Text>
              <Text style={styles.metricValue}>{updateCount}</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>INTERVAL</Text>
              <Text style={styles.metricValue}>3–5 sec</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>STATUS</Text>
              <Text style={[styles.metricValue, { color: statusColor }]}>
                {movingStatus.toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        {/* GPS Telemetry Readout */}
        <View style={styles.telemetryCard}>
          <Text style={styles.cardHeader}>GPS TELEMETRY</Text>

          <View style={styles.telemetryRow}>
            <Text style={styles.telemetryLabel}>Latitude:</Text>
            <Text style={styles.telemetryValue}>
              {coords ? coords.lat.toFixed(6) : 'Acquiring GPS fix...'}
            </Text>
          </View>

          <View style={styles.telemetryRow}>
            <Text style={styles.telemetryLabel}>Longitude:</Text>
            <Text style={styles.telemetryValue}>
              {coords ? coords.lng.toFixed(6) : 'Acquiring GPS fix...'}
            </Text>
          </View>

          <View style={styles.telemetryRow}>
            <Text style={styles.telemetryLabel}>Last Transmitted:</Text>
            <Text style={styles.telemetryValue}>
              {lastSent ? lastSent.toLocaleTimeString() : 'Waiting for 1st ping'}
            </Text>
          </View>

          {lastError && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{lastError}</Text>
            </View>
          )}
        </View>

        {/* Action Controls */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              isTracking ? styles.pauseButton : styles.resumeButton,
            ]}
            onPress={handleToggleTracking}
            activeOpacity={0.8}
          >
            <Text style={styles.actionButtonText}>
              {isTracking ? 'Pause Tracking' : 'Resume Tracking'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.logOutButton} onPress={handleLogOut}>
            <Text style={styles.logOutText}>Disconnect Driver</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 54,
    paddingBottom: 36,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  brandTitle: {
    ...typography.titleMedium,
    color: colors.textPrimary,
  },
  vehicleNo: {
    ...typography.bodyMedium,
    color: colors.brandLight,
    fontWeight: '700',
  },
  dutyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: colors.surface,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  dutyText: {
    ...typography.caption,
    fontWeight: '700',
  },
  serviceNotice: {
    backgroundColor: '#0F2338',
    borderWidth: 1,
    borderColor: '#1E3A5F',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  serviceNoticeTitle: {
    ...typography.caption,
    color: '#60A5FA',
    marginBottom: 3,
  },
  serviceNoticeBody: {
    ...typography.bodyMedium,
    fontSize: 12,
    color: '#93C5FD',
    lineHeight: 16,
  },
  statusCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 24,
    alignItems: 'center',
    marginBottom: 18,
  },
  indicatorRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  indicatorCore: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  statusHeadline: {
    ...typography.titleLarge,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  statusSubline: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  metricsRow: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  metricItem: {
    alignItems: 'center',
  },
  metricDivider: {
    width: 1,
    height: '80%',
    backgroundColor: colors.cardBorder,
    alignSelf: 'center',
  },
  metricLabel: {
    ...typography.caption,
    fontSize: 10,
    color: colors.textMuted,
    marginBottom: 4,
  },
  metricValue: {
    ...typography.bodyLarge,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  telemetryCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
    marginBottom: 24,
  },
  cardHeader: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: 12,
  },
  telemetryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  telemetryLabel: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },
  telemetryValue: {
    ...typography.mono,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
  },
  errorText: {
    ...typography.bodyMedium,
    fontSize: 12,
    color: colors.idle,
  },
  actions: {
    gap: 12,
  },
  actionButton: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  pauseButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  resumeButton: {
    backgroundColor: colors.buttonPrimary,
  },
  actionButtonText: {
    ...typography.bodyLarge,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  logOutButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  logOutText: {
    ...typography.bodyMedium,
    color: colors.textMuted,
  },
});
