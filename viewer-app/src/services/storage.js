/**
 * Auto 24 Unified Storage Service
 * Persists backend server URL, user preferences, and driver profile/tokens.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const KEYS = {
  SERVER_URL: '@auto24_server_url',
  SEARCH_RADIUS: '@auto24_viewer_radius',
  DEVICE_ID: '@auto24_device_id',
  DRIVER_PROFILE: '@auto24_driver_profile',
  REGISTRATION_STATUS: '@auto24_registration_status',
  AUTH_TOKEN: '@auto24_auth_token',
  ACTIVE_MODE: '@auto24_active_mode', // 'passenger' | 'driver'
};

export const PRODUCTION_SERVER_URL = 'https://autoradar-24-5e28a.containers.snapdeploy.app';

function resolveDefaultServerUrl() {
  if (process.env.EXPO_PUBLIC_API_URL && process.env.EXPO_PUBLIC_API_URL.trim()) {
    return process.env.EXPO_PUBLIC_API_URL.trim().replace(/\/+$/, '');
  }

  // Unified production server across web and mobile
  return PRODUCTION_SERVER_URL;
}

export const DEFAULT_SERVER_URL = resolveDefaultServerUrl();

export async function getServerUrl() {
  try {
    const saved = await AsyncStorage.getItem(KEYS.SERVER_URL);
    // If the saved URL is the emulator 10.0.2.2 address but we are running on a physical phone with LAN IP, use LAN IP
    if (saved && saved.includes('10.0.2.2') && DEFAULT_SERVER_URL !== 'http://10.0.2.2:3000') {
      return DEFAULT_SERVER_URL;
    }
    return saved || DEFAULT_SERVER_URL;
  } catch {
    return DEFAULT_SERVER_URL;
  }
}

export async function setServerUrl(url) {
  try {
    const cleanUrl = url.trim().replace(/\/+$/, '');
    await AsyncStorage.setItem(KEYS.SERVER_URL, cleanUrl);
    return cleanUrl;
  } catch (err) {
    console.error('Failed to save server URL:', err);
    return DEFAULT_SERVER_URL;
  }
}

export async function getSavedRadius() {
  try {
    const saved = await AsyncStorage.getItem(KEYS.SEARCH_RADIUS);
    return saved ? parseFloat(saved) : 1.0;
  } catch {
    return 1.0;
  }
}

export async function setSavedRadius(radius) {
  try {
    await AsyncStorage.setItem(KEYS.SEARCH_RADIUS, String(radius));
  } catch (err) {
    console.error('Failed to save radius:', err);
  }
}

function generateDeviceId() {
  const rand = Math.random().toString(36).substring(2, 10);
  const timestamp = Date.now().toString(36);
  return `auto24_${rand}_${timestamp}`;
}

export async function getOrCreateDeviceId() {
  try {
    let deviceId = await AsyncStorage.getItem(KEYS.DEVICE_ID);
    if (!deviceId) {
      deviceId = generateDeviceId();
      await AsyncStorage.setItem(KEYS.DEVICE_ID, deviceId);
    }
    return deviceId;
  } catch (err) {
    console.error('Error accessing device_id in storage:', err);
    return generateDeviceId();
  }
}

export async function saveDriverProfile(profile) {
  try {
    await AsyncStorage.setItem(KEYS.DRIVER_PROFILE, JSON.stringify(profile));
  } catch (err) {
    console.error('Error saving driver profile:', err);
  }
}

export async function getDriverProfile() {
  try {
    const raw = await AsyncStorage.getItem(KEYS.DRIVER_PROFILE);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error('Error loading driver profile:', err);
    return null;
  }
}

export async function saveStatus(status) {
  try {
    await AsyncStorage.setItem(KEYS.REGISTRATION_STATUS, status);
  } catch (err) {
    console.error('Error saving status:', err);
  }
}

export async function saveAuthToken(token) {
  try {
    if (token) {
      await AsyncStorage.setItem(KEYS.AUTH_TOKEN, token);
    } else {
      await AsyncStorage.removeItem(KEYS.AUTH_TOKEN);
    }
  } catch (err) {
    console.error('Error saving auth token:', err);
  }
}

export async function getAuthToken() {
  try {
    return await AsyncStorage.getItem(KEYS.AUTH_TOKEN);
  } catch (err) {
    console.error('Error loading auth token:', err);
    return null;
  }
}

export async function getActiveMode() {
  try {
    const mode = await AsyncStorage.getItem(KEYS.ACTIVE_MODE);
    return mode || 'passenger';
  } catch {
    return 'passenger';
  }
}

export async function setActiveMode(mode) {
  try {
    await AsyncStorage.setItem(KEYS.ACTIVE_MODE, mode);
  } catch (err) {
    console.error('Error saving active mode:', err);
  }
}

export async function clearDriverSession() {
  try {
    await AsyncStorage.multiRemove([
      KEYS.DRIVER_PROFILE,
      KEYS.REGISTRATION_STATUS,
      KEYS.AUTH_TOKEN,
    ]);
  } catch (err) {
    console.error('Error clearing driver session:', err);
  }
}
