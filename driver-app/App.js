/**
 * Auto 24 Driver App - Root Application
 * Router between Registration, Pending Approval, and Active Tracking states.
 */

import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import RegistrationScreen from './src/screens/RegistrationScreen';
import PendingScreen from './src/screens/PendingScreen';
import TrackingScreen from './src/screens/TrackingScreen';
import colors from './src/theme/colors';
import { getDriverProfile, getOrCreateDeviceId } from './src/services/storage';
import { getRegistrationStatusApi } from './src/services/api';

const APP_STATE = {
  LOADING: 'LOADING',
  REGISTER: 'REGISTER',
  PENDING: 'PENDING',
  TRACKING: 'TRACKING',
};

export default function App() {
  const [appState, setAppState] = useState(APP_STATE.LOADING);
  const [driverProfile, setDriverProfile] = useState(null);

  useEffect(() => {
    async function restoreSession() {
      try {
        const deviceId = await getOrCreateDeviceId();
        const profile = await getDriverProfile();

        if (!profile) {
          try {
            // Check if server already has this device registered
            const serverCheck = await getRegistrationStatusApi(deviceId);
            if (!serverCheck.notFound && serverCheck.name) {
              const restored = {
                ...serverCheck,
                device_id: deviceId,
              };
              setDriverProfile(restored);
              if (serverCheck.status === 'approved') {
                setAppState(APP_STATE.TRACKING);
              } else {
                setAppState(APP_STATE.PENDING);
              }
              return;
            }
          } catch {
            // First-time launch or server temporarily unreachable, proceed to register
          }

          setAppState(APP_STATE.REGISTER);
          return;
        }

        // Profile found locally - check live status from server
        setDriverProfile(profile);
        try {
          const statusRes = await getRegistrationStatusApi(deviceId);
          if (statusRes.status === 'approved') {
            setAppState(APP_STATE.TRACKING);
          } else {
            setAppState(APP_STATE.PENDING);
          }
        } catch {
          // If offline, fallback to locally saved status or pending
          setAppState(profile.status === 'approved' ? APP_STATE.TRACKING : APP_STATE.PENDING);
        }
      } catch (err) {
        console.error('Session restore failed:', err);
        setAppState(APP_STATE.REGISTER);
      }
    }

    restoreSession();
  }, []);

  // Handlers for state transitions
  const handleRegistered = (profile) => {
    setDriverProfile(profile);
    setAppState(APP_STATE.PENDING);
  };

  const handleApproved = (serverDriver) => {
    setDriverProfile((prev) => ({ ...prev, ...serverDriver, status: 'approved' }));
    setAppState(APP_STATE.TRACKING);
  };

  const handleResetOrLogOut = () => {
    setDriverProfile(null);
    setAppState(APP_STATE.REGISTER);
  };

  if (appState === APP_STATE.LOADING) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {appState === APP_STATE.REGISTER && (
        <RegistrationScreen onRegistered={handleRegistered} />
      )}
      {appState === APP_STATE.PENDING && driverProfile && (
        <PendingScreen
          profile={driverProfile}
          onApproved={handleApproved}
          onReset={handleResetOrLogOut}
        />
      )}
      {appState === APP_STATE.TRACKING && driverProfile && (
        <TrackingScreen
          profile={driverProfile}
          onLogOut={handleResetOrLogOut}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
