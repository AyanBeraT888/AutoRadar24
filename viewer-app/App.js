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
          {/* Floating Glassmorphism Hamburger Button */}
          <View style={styles.floatingHeader}>
            <TouchableOpacity
              style={styles.floatingMenuBtn}
              onPress={() => setSidebarVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.floatingMenuIcon}>☰</Text>
            </TouchableOpacity>
          </View>

          {/* Main Leaflet Map WebView */}
          {loadError ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorTitle}>Cannot Reach Backend</Text>
              <Text style={styles.errorDesc}>
                Make sure the backend server is running on:{'\n'}
                <Text style={styles.errorUrl}>{serverUrl}</Text>
              </Text>

              <TouchableOpacity style={styles.retryBtn} onPress={handleReloadMap}>
                <Text style={styles.retryBtnText}>Retry Connection</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.changeServerBtn}
                onPress={() => setConfigVisible(true)}
              >
                <Text style={styles.changeServerText}>Change Server Address</Text>
              </TouchableOpacity>
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
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator size="large" color={colors.brandGold} />
                  <Text style={styles.loadingText}>Connecting to Auto 24 Radar...</Text>
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
  floatingMenuBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(22, 27, 34, 0.90)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  floatingMenuIcon: {
    color: colors.brandGold,
    fontSize: 22,
    fontWeight: '800',
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#0D1117',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  errorDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  errorUrl: {
    color: colors.brandGold,
    fontWeight: '600',
  },
  retryBtn: {
    backgroundColor: colors.brandGold,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 12,
    width: '100%',
    maxWidth: 280,
    alignItems: 'center',
  },
  retryBtnText: {
    color: '#0D1117',
    fontSize: 15,
    fontWeight: '700',
  },
  changeServerBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    width: '100%',
    maxWidth: 280,
    alignItems: 'center',
  },
  changeServerText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
});
