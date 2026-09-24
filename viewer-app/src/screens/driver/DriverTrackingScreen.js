/**
 * Auto 24 Driver Mode - Active Tracking Screen
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
  Platform,
} from 'react-native';
import colors from '../../theme/colors';
import typography from '../../theme/typography';
import {
  startTracking,
  stopTracking,
  subscribeToLocationUpdates,
  getTrackingMode,
} from '../../services/driverLocationTask';
import { clearDriverSession } from '../../services/storage';

export default function DriverTrackingScreen({ profile, onLogOut, onOpenMenu }) {
  const [isTracking, setIsTracking] = useState(true);
  const [trackingMode, setTrackingMode] = useState(getTrackingMode());
  const [movingStatus, setMovingStatus] = useState('idle');
  const [coords, setCoords] = useState(null);
  const [lastSent, setLastSent] = useState(null);
  const [updateCount, setUpdateCount] = useState(0);
  const [lastError, setLastError] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function initTracking() {
      try {
        await startTracking();
        if (mounted) {
          setIsTracking(true);
          setTrackingMode(getTrackingMode());
        }
      } catch (err) {
        if (mounted) {
          setLastError(err.message);
          Alert.alert('Permission Error', err.message);
        }
      }
    }

    initTracking();

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
        if (data.trackingMode) {
          setTrackingMode(data.trackingMode);
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

  const handleToggleTracking = async () => {
    try {
      if (isTracking) {
        await stopTracking();
        setIsTracking(false);
        setTrackingMode('idle');
        setMovingStatus('idle');
      } else {
        await startTracking();
        setIsTracking(true);
        setTrackingMode(getTrackingMode());
      }
    } catch (err) {
      Alert.alert('Tracking Error', err.message);
    }
  };

  const handleLogOut = () => {
    Alert.alert(
      'Stop & Log Off',
      'This will stop tracking and clear your device profile.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Off',
          style: 'destructive',
          onPress: async () => {
            await stopTracking();
            await clearDriverSession();
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
    ? colors.movingGreen
    : colors.idleRed;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Top Header with Menu Button */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.menuBtn} onPress={onOpenMenu} activeOpacity={0.7}>
            <Text style={styles.menuIcon}>☰</Text>
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.brandTitle}>AutoRadar18</Text>
            <Text style={styles.vehicleNo}>{profile?.vehicle_no || 'Vehicle'}</Text>
          </View>
          <View style={[styles.dutyBadge, { borderColor: statusColor }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.dutyText, { color: statusColor }]}>
              {!isTracking ? 'PAUSED' : isMoving ? 'MOVING' : 'IDLE'}
            </Text>
          </View>
        </View>

        {/* Foreground / Background Service Notice Card */}
        <View
          style={[
            styles.serviceNotice,
            trackingMode === 'foreground' && styles.serviceNoticeForeground,
          ]}
        >
          <Text
            style={[
              styles.serviceNoticeTitle,
              trackingMode === 'foreground' && styles.serviceNoticeForegroundTitle,
            ]}
          >
            {trackingMode === 'foreground'
              ? '⚡ LIVE BROADCAST ACTIVE (EXPO GO)'
              : trackingMode === 'background'
              ? '🛡️ BACKGROUND FOREGROUND SERVICE ACTIVE'
              : 'BROADCAST PAUSED'}
          </Text>
          <Text style={styles.serviceNoticeBody}>
            {trackingMode === 'foreground'
              ? 'Broadcasting high-accuracy GPS & motion telemetry while app is open. Note: Full background tracking (with screen off) is activated in standalone APK builds.'
              : trackingMode === 'background'
              ? 'Continuous background broadcast enabled. A persistent notification is visible in your Android system tray.'
              : 'Tracking is currently halted. Tap Resume Tracking below to re-broadcast.'}
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
              ? 'Vehicle in motion - broadcasting live location.'
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
              <Text style={styles.metricValue}>3-5 sec</Text>
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
            <Text style={styles.telemetryLabel}>Speed:</Text>
            <Text style={styles.telemetryValue}>
              {coords && coords.speed != null && coords.speed > 0
                ? `${(coords.speed * 3.6).toFixed(1)} km/h`
                : '0.0 km/h'}
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

          <TouchableOpacity
            style={styles.logOutButton}
            onPress={handleLogOut}
            activeOpacity={0.8}
          >
            <Text style={styles.logOutText}>Disconnect & Reset Vehicle</Text>
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
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 44 : 20,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
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
  headerInfo: {
    flex: 1,
    marginLeft: 14,
  },
  brandTitle: {
    ...typography.titleMedium,
    color: colors.textPrimary,
  },
  vehicleNo: {
    ...typography.caption,
    color: colors.brandGold,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dutyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
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
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: colors.brandGold,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  serviceNoticeTitle: {
    ...typography.caption,
    color: colors.brandGold,
    fontWeight: '700',
    marginBottom: 2,
  },
  serviceNoticeBody: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  serviceNoticeForeground: {
    borderLeftColor: '#38BDF8',
  },
  serviceNoticeForegroundTitle: {
    color: '#38BDF8',
  },
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: 16,
  },
  indicatorRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  indicatorCore: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  statusHeadline: {
    ...typography.titleMedium,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  statusSubline: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
    fontSize: 13,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  metricItem: {
    alignItems: 'center',
  },
  metricLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 10,
    marginBottom: 4,
  },
  metricValue: {
    ...typography.bodyLarge,
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.cardBorder,
  },
  telemetryCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 20,
  },
  cardHeader: {
    ...typography.caption,
    color: colors.textSecondary,
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
  },
  errorBanner: {
    backgroundColor: colors.idleGlow,
    borderWidth: 1,
    borderColor: colors.idleRed,
    padding: 8,
    borderRadius: 6,
    marginTop: 10,
  },
  errorText: {
    color: colors.idleRed,
    fontSize: 12,
  },
  actions: {
    gap: 12,
  },
  actionButton: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  pauseButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  resumeButton: {
    backgroundColor: colors.brandGold,
  },
  actionButtonText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  logOutButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  logOutText: {
    color: colors.idleRed,
    fontSize: 13,
    fontWeight: '600',
  },
});
