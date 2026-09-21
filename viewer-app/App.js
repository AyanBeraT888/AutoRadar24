/**
 * Auto 24 Unified Mobile Application
 * Merged Passenger Radar & Driver Console with Slide-in Sidebar Mode Selector.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import colors from './src/theme/colors';
import {
  getServerUrl,
  setServerUrl,
  getActiveMode,
  setActiveMode,
  getOrCreateDeviceId,
  getDriverProfile,
  saveStatus,
} from './src/services/storage';
import { getRegistrationStatusApi } from './src/services/driverApi';
import { stopTracking } from './src/services/driverLocationTask';
import ServerConfigModal from './src/components/ServerConfigModal';
import SidebarDrawer from './src/components/SidebarDrawer';
import DriverRegistrationScreen from './src/screens/driver/DriverRegistrationScreen';
import DriverPendingScreen from './src/screens/driver/DriverPendingScreen';
import DriverTrackingScreen from './src/screens/driver/DriverTrackingScreen';

const DRIVER_STATE = {
  LOADING: 'LOADING',
  REGISTER: 'REGISTER',
  PENDING: 'PENDING',
  TRACKING: 'TRACKING',
};

export default function App() {
  const [currentMode, setCurrentMode] = useState('passenger'); // 'passenger' | 'driver'
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [serverUrl, setServerUrlState] = useState(null);
  const [configVisible, setConfigVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryCountdown, setRetryCountdown] = useState(5);

  // Auto-retry timer when connection to backend is interrupted
  useEffect(() => {
    let timer = null;
    if (loadError && currentMode === 'passenger') {
      setRetryCountdown(5);
      timer = setInterval(() => {
        setRetryCountdown((prev) => {
          if (prev <= 1) {
            handleReloadMap();
            return 5;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [loadError, currentMode]);

  // Driver Mode State
  const [driverState, setDriverState] = useState(DRIVER_STATE.LOADING);
  const [driverProfile, setDriverProfile] = useState(null);

  const webViewRef = useRef(null);
  const lastLocationRef = useRef(null);

  const injectLocationIntoWebView = (coords) => {
    if (!coords || !webViewRef.current) return;
    const { latitude, longitude, accuracy } = coords;
    const jsCode = `
      if (typeof window.handleNativeLocation === 'function') {
        window.handleNativeLocation(${latitude}, ${longitude}, ${accuracy || 0});
      }
      true;
    `;
    webViewRef.current.injectJavaScript(jsCode);
  };

  // 1. Initial Application Setup & Session Restore
  useEffect(() => {
    let locationSub = null;

    async function init() {
      try {
        const [savedUrl, savedMode] = await Promise.all([
          getServerUrl(),
          getActiveMode(),
        ]);
        setServerUrlState(savedUrl);
        setCurrentMode(savedMode || 'passenger');

        // Request foreground location for Passenger radar map
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const current = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          if (current && current.coords) {
            lastLocationRef.current = current.coords;
            injectLocationIntoWebView(current.coords);
          }

          locationSub = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 4000,
              distanceInterval: 5,
            },
            (loc) => {
              if (loc && loc.coords) {
                lastLocationRef.current = loc.coords;
                injectLocationIntoWebView(loc.coords);
              }
            }
          );
        }

        // Restore driver profile status
        await restoreDriverSession();
      } catch (err) {
        console.warn('App initialization warning:', err);
      }
    }

    init();

    return () => {
      if (locationSub) {
        locationSub.remove();
      }
    };
  }, []);

  // 2. Driver Session Check Helper
  const restoreDriverSession = async () => {
    try {
      const deviceId = await getOrCreateDeviceId();
      const profile = await getDriverProfile();

      if (!profile) {
        try {
          const serverCheck = await getRegistrationStatusApi(deviceId);
          if (!serverCheck.notFound && serverCheck.name) {
            const restored = {
              ...serverCheck,
              device_id: deviceId,
            };
            setDriverProfile(restored);
            if (serverCheck.status === 'approved') {
              setDriverState(DRIVER_STATE.TRACKING);
            } else {
              setDriverState(DRIVER_STATE.PENDING);
            }
            return;
          }
        } catch {
          // Server not reachable yet or device unregistered
        }
        setDriverState(DRIVER_STATE.REGISTER);
        return;
      }

      setDriverProfile(profile);
      try {
        const statusRes = await getRegistrationStatusApi(deviceId);
        if (statusRes.status === 'approved') {
          await saveStatus('approved');
          setDriverState(DRIVER_STATE.TRACKING);
        } else {
          setDriverState(DRIVER_STATE.PENDING);
        }
      } catch {
        setDriverState(profile.status === 'approved' ? DRIVER_STATE.TRACKING : DRIVER_STATE.PENDING);
      }
    } catch (err) {
      console.warn('Driver session restore error:', err);
      setDriverState(DRIVER_STATE.REGISTER);
    }
  };

  // 3. Mode Switching Handler
  const handleSelectMode = async (newMode) => {
    if (newMode === currentMode) return;

    // Safety: If leaving Driver Mode, ensure background location broadcasting is stopped
    if (currentMode === 'driver') {
      try {
        await stopTracking();
      } catch (e) {
        console.warn('Error stopping driver tracking:', e);
      }
    }

    setCurrentMode(newMode);
    await setActiveMode(newMode);

    if (newMode === 'driver') {
      await restoreDriverSession();
    } else {
      // Re-inject GPS into webview when switching back to Passenger radar
      if (lastLocationRef.current) {
        setTimeout(() => {
          injectLocationIntoWebView(lastLocationRef.current);
        }, 500);
      }
    }
  };

  // 4. Server Configuration Save Handler
  const handleSaveServer = async (newUrl) => {
    const saved = await setServerUrl(newUrl);
    setServerUrlState(saved);
    setConfigVisible(false);
    setLoadError(false);
    setIsLoading(true);
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
    if (currentMode === 'driver') {
      await restoreDriverSession();
    }
  };

  const handleReloadMap = () => {
    setLoadError(false);
    setIsLoading(true);
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
  };

  const handleRecenterMap = () => {
    if (lastLocationRef.current) {
      injectLocationIntoWebView(lastLocationRef.current);
    }
  };

  if (!serverUrl) {
    return (
      <SafeAreaProvider>
        <View style={styles.loadingContainer}>
          <StatusBar style="light" />
          <ActivityIndicator size="large" color={colors.brandGold} />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" backgroundColor="#0D1117" />

      {/* ======================================================== */}
      {/* MODE 1: PASSENGER RADAR (FULLSCREEN MAP WITH FLOATING MENU) */}
      {/* ======================================================== */}
      {currentMode === 'passenger' && (
        <View style={styles.mapContainer}>
          {/* Floating Glassmorphism Beacon Mode Switch Button */}
          <View style={styles.floatingHeader}>
            <TouchableOpacity
              style={styles.floatingBeaconBtn}
              onPress={() => setSidebarVisible(true)}
              activeOpacity={0.8}
            >
              <View style={styles.beaconDotWrapper}>
                <View style={styles.beaconDotPulse} />
                <Text style={styles.beaconIconEmoji}>📡</Text>
              </View>
              <View style={styles.beaconTextCol}>
                <Text style={styles.beaconModeText}>PASSENGER RADAR</Text>
                <Text style={styles.beaconSubText}>Tap beacon to switch mode</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Main Leaflet Map WebView & Fallback Card */}
          {loadError ? (
            <View style={styles.fallbackCardWrapper}>
              <View style={styles.fallbackCard}>
                {/* Glowing Radar Offline Beacon */}
                <View style={styles.fallbackRadarIconWrapper}>
                  <View style={styles.fallbackRadarOuterRing} />
                  <Text style={styles.fallbackRadarEmoji}>📡</Text>
                </View>

                <View style={styles.fallbackBadge}>
                  <View style={styles.fallbackBadgeDot} />
                  <Text style={styles.fallbackBadgeText}>RADAR OFFLINE • CANNOT REACH SERVER</Text>
                </View>

                <Text style={styles.fallbackHeading}>Radar Signal Interrupted</Text>
                <Text style={styles.fallbackSubtext}>
                  Unable to establish a live telemetry connection with the Auto 24 backend.
                </Text>

                <View style={styles.fallbackDiagBox}>
                  <Text style={styles.fallbackDiagLabel}>TARGET SERVER</Text>
                  <Text style={styles.fallbackDiagUrl} numberOfLines={1}>{serverUrl}</Text>
                </View>

                <TouchableOpacity
                  style={styles.fallbackPrimaryBtn}
                  onPress={handleReloadMap}
                  activeOpacity={0.8}
                >
                  <Text style={styles.fallbackPrimaryBtnText}>⚡ Re-Scan Radar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.fallbackSecondaryBtn}
                  onPress={() => setConfigVisible(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.fallbackSecondaryBtnText}>⚙️ Change Server Address</Text>
                </TouchableOpacity>

                <Text style={styles.fallbackCountdownText}>
                  Auto-retrying in {retryCountdown}s...
                </Text>
              </View>
            </View>
          ) : (
            <WebView
              ref={webViewRef}
              source={{ uri: serverUrl }}
              style={styles.webView}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              geolocationEnabled={true}
              startInLoadingState={true}
              renderLoading={() => (
                <View style={styles.skeletonLoadingOverlay}>
                  <View style={styles.skeletonSonarContainer}>
                    <View style={styles.skeletonSonarRing1} />
                    <View style={styles.skeletonSonarRing2} />
                    <Text style={styles.skeletonRadarCenterEmoji}>📡</Text>
                  </View>
                  <Text style={styles.skeletonLoadingTitle}>CALIBRATING LIVE GPS RADAR</Text>
                  <Text style={styles.skeletonLoadingSub}>Acquiring live satellite feed & nearby autos...</Text>
                  <ActivityIndicator size="small" color={colors.brandGold} style={{ marginTop: 14 }} />
                </View>
              )}
              onLoadStart={() => setIsLoading(true)}
              onLoadEnd={() => {
                setIsLoading(false);
                if (lastLocationRef.current) {
                  setTimeout(() => {
                    injectLocationIntoWebView(lastLocationRef.current);
                  }, 600);
                }
              }}
              onGeolocationPermissionsShowPrompt={(prompt) => {
                prompt({ origin: prompt.origin, allow: true, retain: true });
              }}
              onError={() => {
                setIsLoading(false);
                setLoadError(true);
              }}
            />
          )}
        </View>
      )}

      {/* ======================================================== */}
      {/* MODE 2: DRIVER CONSOLE (REGISTRATION / PENDING / TRACKING) */}
      {/* ======================================================== */}
      {currentMode === 'driver' && (
        <View style={styles.driverContainer}>
          {driverState === DRIVER_STATE.LOADING && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.brandGold} />
              <Text style={styles.loadingText}>Verifying driver credentials...</Text>
            </View>
          )}

          {driverState === DRIVER_STATE.REGISTER && (
            <DriverRegistrationScreen
              onRegistered={(profile) => {
                setDriverProfile(profile);
                setDriverState(DRIVER_STATE.PENDING);
              }}
              onOpenMenu={() => setSidebarVisible(true)}
            />
          )}

          {driverState === DRIVER_STATE.PENDING && (
            <DriverPendingScreen
              profile={driverProfile}
              onApproved={(driver) => {
                setDriverProfile((prev) => ({ ...prev, ...driver, status: 'approved' }));
                setDriverState(DRIVER_STATE.TRACKING);
              }}
              onReset={() => {
                setDriverProfile(null);
                setDriverState(DRIVER_STATE.REGISTER);
              }}
              onOpenMenu={() => setSidebarVisible(true)}
            />
          )}

          {driverState === DRIVER_STATE.TRACKING && (
            <DriverTrackingScreen
              profile={driverProfile}
              onLogOut={() => {
                setDriverProfile(null);
                setDriverState(DRIVER_STATE.REGISTER);
              }}
              onOpenMenu={() => setSidebarVisible(true)}
            />
          )}
        </View>
      )}

      {/* ======================================================== */}
      {/* SIDEBAR NAVIGATION DRAWER */}
      {/* ======================================================== */}
      <SidebarDrawer
        visible={sidebarVisible}
        currentMode={currentMode}
        onSelectMode={handleSelectMode}
        onClose={() => setSidebarVisible(false)}
        onOpenServerConfig={() => setConfigVisible(true)}
        onReloadMap={handleReloadMap}
        onRecenterMap={handleRecenterMap}
        serverUrl={serverUrl}
        driverStatus={driverProfile?.status}
      />

      {/* ======================================================== */}
      {/* SERVER CONFIGURATION MODAL */}
      {/* ======================================================== */}
      <ServerConfigModal
        visible={configVisible}
        currentUrl={serverUrl}
        onClose={() => setConfigVisible(false)}
        onSave={handleSaveServer}
      />
    </SafeAreaView>
  </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1117',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0D1117',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: colors.textSecondary,
    fontSize: 14,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  driverContainer: {
    flex: 1,
  },
  floatingHeader: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 16,
    right: 16,
    zIndex: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    pointerEvents: 'box-none',
  },
  floatingBeaconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 24,
    backgroundColor: 'rgba(22, 27, 34, 0.92)',
    borderWidth: 1,
    borderColor: colors.brandGold,
    shadowColor: colors.brandGold,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
    gap: 8,
  },
  beaconDotWrapper: {
    position: 'relative',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 204, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  beaconDotPulse: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.brandGold,
    opacity: 0.6,
  },
  beaconIconEmoji: {
    fontSize: 14,
  },
  beaconTextCol: {
    flexDirection: 'column',
  },
  beaconModeText: {
    color: colors.brandGold,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  beaconSubText: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '600',
  },
  webView: {
    flex: 1,
    backgroundColor: '#0D1117',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0D1117',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  fallbackCardWrapper: {
    flex: 1,
    backgroundColor: '#080C14',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  fallbackCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: 'rgba(17, 24, 39, 0.96)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    padding: 26,
    alignItems: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  fallbackRadarIconWrapper: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    position: 'relative',
  },
  fallbackRadarOuterRing: {
    position: 'absolute',
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    borderStyle: 'dashed',
  },
  fallbackRadarEmoji: {
    fontSize: 28,
  },
  fallbackBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    marginBottom: 10,
    gap: 6,
  },
  fallbackBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F59E0B',
  },
  fallbackBadgeText: {
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  fallbackHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 6,
  },
  fallbackSubtext: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  fallbackDiagBox: {
    width: '100%',
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    padding: 10,
    marginBottom: 18,
  },
  fallbackDiagLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  fallbackDiagUrl: {
    fontSize: 12,
    color: '#F59E0B',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  fallbackPrimaryBtn: {
    width: '100%',
    backgroundColor: colors.brandGold,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: colors.brandGold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  fallbackPrimaryBtnText: {
    color: '#0B0F17',
    fontSize: 14,
    fontWeight: '700',
  },
  fallbackSecondaryBtn: {
    width: '100%',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    alignItems: 'center',
  },
  fallbackSecondaryBtnText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  fallbackCountdownText: {
    marginTop: 12,
    fontSize: 11,
    color: '#64748B',
  },
  skeletonLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#080C14',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 10,
  },
  skeletonSonarContainer: {
    width: 90,
    height: 90,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  skeletonSonarRing1: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255, 204, 0, 0.4)',
  },
  skeletonSonarRing2: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 1,
    borderColor: 'rgba(255, 204, 0, 0.2)',
    borderStyle: 'dashed',
  },
  skeletonRadarCenterEmoji: {
    fontSize: 26,
  },
  skeletonLoadingTitle: {
    color: colors.brandGold,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  skeletonLoadingSub: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
  },
});
