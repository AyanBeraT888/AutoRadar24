/**
 * Auto 24 Unified Sidebar Drawer
 * Slide-in navigation drawer containing the Mode Selector (Passenger Radar vs Driver Console)
 * and quick utilities (Server Settings, Refresh Map, Recenter GPS).
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
  Platform,
  Switch,
  Linking,
  Alert,
  ScrollView,
} from 'react-native';
import * as Location from 'expo-location';
import colors from '../theme/colors';
import typography from '../theme/typography';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.82, 320);

export default function SidebarDrawer({
  visible,
  currentMode,
  onSelectMode,
  onClose,
  onOpenServerConfig,
  onOpenRadarSettings,
  onReloadMap,
  onRecenterMap,
  serverUrl,
  driverStatus,
}) {
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Permissions & Services State
  const [locationPerm, setLocationPerm] = useState(true);
  const [motionPerm, setMotionPerm] = useState(true);
  const [networkPerm, setNetworkPerm] = useState(true);

  // Sync actual location permission state whenever drawer opens
  useEffect(() => {
    if (visible) {
      Location.getForegroundPermissionsAsync()
        .then(({ status }) => {
          setLocationPerm(status === 'granted');
        })
        .catch(() => {});
    }
  }, [visible]);

  const handleToggleLocation = async (value) => {
    if (value) {
      try {
        const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          setLocationPerm(true);
          if (onRecenterMap) onRecenterMap();
        } else {
          setLocationPerm(false);
          Alert.alert(
            'Location Permission Required',
            'Precise location was previously declined or blocked. Open your device settings to allow location access so Auto 24 can locate nearby vehicles.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ]
          );
        }
      } catch (err) {
        Alert.alert('Settings', 'Please allow location in device settings.');
      }
    } else {
      setLocationPerm(false);
    }
  };

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -DRAWER_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, fadeAnim]);

  const handleModeChange = (mode) => {
    onSelectMode(mode);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Semi-transparent Backdrop */}
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]} />
        </TouchableWithoutFeedback>

        {/* Sliding Sidebar Drawer Panel */}
        <Animated.View
          style={[
            styles.drawer,
            {
              transform: [{ translateX: slideAnim }],
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <View style={styles.logoBadge}>
                <Text style={styles.logoText}>18</Text>
              </View>
              <View style={styles.brandTextContainer}>
                <Text style={styles.brandTitle}>AutoRadar18</Text>
                <Text style={styles.brandSubtitle}>Transit Network</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Scrollable Drawer Body */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            bounces={false}
          >
            {/* Mode Selector Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>SELECT MODE</Text>

              {/* Passenger Radar Mode Card */}
              <TouchableOpacity
                style={[
                  styles.modeCard,
                  currentMode === 'passenger' && styles.modeCardActive,
                ]}
                onPress={() => handleModeChange('passenger')}
                activeOpacity={0.8}
              >
                <View style={styles.modeCardContent}>
                  <View style={styles.modeHeader}>
                    <Text
                      style={[
                        styles.modeTitle,
                        currentMode === 'passenger' && styles.modeTitleActive,
                      ]}
                    >
                      Passenger Radar
                    </Text>
                    {currentMode === 'passenger' && (
                      <View style={styles.activePill}>
                        <Text style={styles.activePillText}>ACTIVE</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.modeDescription}>
                    Live radar map, nearby vehicle tracking and traffic telemetry.
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Driver Console Mode Card */}
              <TouchableOpacity
                style={[
                  styles.modeCard,
                  currentMode === 'driver' && styles.modeCardActive,
                ]}
                onPress={() => handleModeChange('driver')}
                activeOpacity={0.8}
              >
                <View style={styles.modeCardContent}>
                  <View style={styles.modeHeader}>
                    <Text
                      style={[
                        styles.modeTitle,
                        currentMode === 'driver' && styles.modeTitleActive,
                      ]}
                    >
                      Driver Console
                    </Text>
                    {currentMode === 'driver' ? (
                      <View style={styles.activePill}>
                        <Text style={styles.activePillText}>ACTIVE</Text>
                      </View>
                    ) : driverStatus === 'approved' ? (
                      <View style={styles.verifiedPill}>
                        <Text style={styles.verifiedPillText}>VERIFIED</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.modeDescription}>
                    Broadcast vehicle coordinates, manage shifts, and sensor telemetry.
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Quick Actions Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>QUICK ACTIONS</Text>

              {currentMode === 'passenger' && (
                <>
                  <TouchableOpacity
                    style={styles.actionRow}
                    onPress={() => {
                      onClose();
                      if (onOpenRadarSettings) onOpenRadarSettings();
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.actionIconBox}>
                      <Text style={styles.actionIcon}>🎯</Text>
                    </View>
                    <Text style={styles.actionLabel}>Radar Search Radius</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionRow}
                    onPress={() => {
                      onClose();
                      onReloadMap();
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.actionIconBox}>
                      <Text style={styles.actionIcon}>🔄</Text>
                    </View>
                    <Text style={styles.actionLabel}>Reload Radar Map</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionRow}
                    onPress={() => {
                      onClose();
                      onRecenterMap();
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.actionIconBox}>
                      <Text style={styles.actionIcon}>📍</Text>
                    </View>
                    <Text style={styles.actionLabel}>Recenter My Location</Text>
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => {
                  onClose();
                  onOpenServerConfig();
                }}
                activeOpacity={0.7}
              >
                <View style={styles.actionIconBox}>
                  <Text style={styles.actionIcon}>⚙️</Text>
                </View>
                <Text style={styles.actionLabel}>Server Settings</Text>
              </TouchableOpacity>
            </View>

            {/* Device Permissions & Services Breakdown with Toggles */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>DEVICE PERMISSIONS & SERVICES</Text>
              <View style={styles.permCard}>
                {/* 1. Precise Location (GPS) - Always available */}
                <View style={styles.permRow}>
                  <Text style={styles.permIcon}>📍</Text>
                  <View style={styles.permTextCol}>
                    <View style={styles.permHeaderRow}>
                      <Text style={styles.permTitle}>Precise Location (GPS)</Text>
                      <Switch
                        value={locationPerm}
                        onValueChange={handleToggleLocation}
                        trackColor={{ false: '#374151', true: colors.brandGold }}
                        thumbColor={locationPerm ? '#0D1117' : '#9CA3AF'}
                        style={styles.switchCompact}
                      />
                    </View>
                    <Text style={styles.permService}>
                      {currentMode === 'passenger'
                        ? '• Centers live radar map & finds nearby autos'
                        : '• Broadcasts vehicle GPS position to passengers'}
                    </Text>
                  </View>
                </View>

                {/* Driver-only Permissions: Motion & Compass, Network & Telemetry */}
                {currentMode === 'driver' && (
                  <>
                    <View style={styles.permDivider} />

                    {/* 2. Motion & Compass */}
                    <View style={styles.permRow}>
                      <Text style={styles.permIcon}>🧭</Text>
                      <View style={styles.permTextCol}>
                        <View style={styles.permHeaderRow}>
                          <Text style={styles.permTitle}>Motion & Compass</Text>
                          <Switch
                            value={motionPerm}
                            onValueChange={(val) => setMotionPerm(val)}
                            trackColor={{ false: '#374151', true: colors.brandGold }}
                            thumbColor={motionPerm ? '#0D1117' : '#9CA3AF'}
                            style={styles.switchCompact}
                          />
                        </View>
                        <Text style={styles.permService}>
                          • Heading Service: Align vehicle bearing along direction of travel
                        </Text>
                      </View>
                    </View>

                    <View style={styles.permDivider} />

                    {/* 3. Network & Telemetry */}
                    <View style={styles.permRow}>
                      <Text style={styles.permIcon}>🌐</Text>
                      <View style={styles.permTextCol}>
                        <View style={styles.permHeaderRow}>
                          <Text style={styles.permTitle}>Network & Telemetry</Text>
                          <Switch
                            value={networkPerm}
                            onValueChange={(val) => setNetworkPerm(val)}
                            trackColor={{ false: '#374151', true: colors.brandGold }}
                            thumbColor={networkPerm ? '#0D1117' : '#9CA3AF'}
                            style={styles.switchCompact}
                          />
                        </View>
                        <Text style={styles.permService}>
                          • Cloud Telemetry: Real-time streaming with AutoRadar18 cloud radar node
                        </Text>
                      </View>
                    </View>
                  </>
                )}
              </View>
            </View>
          </ScrollView>

          {/* Footer Info */}
          <View style={styles.footer}>
            <View style={styles.footerRow}>
              <Text style={styles.footerLabel}>SERVER</Text>
              <Text style={styles.footerValue} numberOfLines={1} ellipsizeMode="tail">
                {serverUrl || 'Default'}
              </Text>
            </View>
            <Text style={styles.versionText}>AutoRadar18 Platform v1.0.0</Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  drawer: {
    width: DRAWER_WIDTH,
    backgroundColor: colors.surface,
    height: '100%',
    paddingTop: Platform.OS === 'ios' ? 48 : 24,
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderRightWidth: 1,
    borderRightColor: colors.cardBorder,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 16,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 9,
    backgroundColor: colors.brandGold,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  logoText: {
    color: '#0D1117',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  brandTextContainer: {
    justifyContent: 'center',
  },
  brandTitle: {
    ...typography.titleMedium,
    color: colors.textPrimary,
    fontSize: 18,
    lineHeight: 22,
  },
  brandSubtitle: {
    ...typography.caption,
    color: colors.brandGold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.cardBg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  closeIcon: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  modeCard: {
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 10,
  },
  modeCardActive: {
    borderColor: colors.brandGold,
    backgroundColor: 'rgba(255, 204, 0, 0.08)',
  },
  modeCardContent: {
    width: '100%',
  },
  modeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modeTitle: {
    ...typography.titleMedium,
    fontSize: 15,
    color: colors.textPrimary,
  },
  modeTitleActive: {
    color: colors.brandGold,
  },
  modeDescription: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  activePill: {
    backgroundColor: colors.brandGold,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activePillText: {
    color: '#0D1117',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  verifiedPill: {
    backgroundColor: colors.movingGlow,
    borderColor: colors.movingGreen,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  verifiedPillText: {
    color: colors.movingGreen,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
  actionIconBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: colors.cardBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  actionIcon: {
    color: colors.brandGold,
    fontSize: 12,
    fontWeight: '800',
  },
  actionLabel: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: 14,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  footerLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
  },
  footerValue: {
    ...typography.mono,
    color: colors.textSecondary,
    fontSize: 11,
    maxWidth: 190,
  },
  versionText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 4,
  },
  permCard: {
    backgroundColor: colors.cardBg,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  permIcon: {
    fontSize: 14,
    marginTop: 2,
  },
  permTextCol: {
    flex: 1,
  },
  permTitle: {
    ...typography.titleMedium,
    fontSize: 12,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  permService: {
    ...typography.caption,
    fontSize: 10,
    color: colors.textSecondary,
    lineHeight: 14,
  },
  permDivider: {
    height: 1,
    backgroundColor: colors.cardBorder,
    marginVertical: 8,
  },
  permHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  switchCompact: {
    transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }],
    marginRight: -4,
  },
  scrollContent: {
    paddingBottom: 16,
  },
});
