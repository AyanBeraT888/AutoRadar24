/**
 * Local Storage Service for Auto 24 Driver App
 * Manages device_id persistence and cached driver credentials.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  DEVICE_ID: 'auto24_device_id',
  DRIVER_PROFILE: 'auto24_driver_profile',
  REGISTRATION_STATUS: 'auto24_registration_status',
  AUTH_TOKEN: 'auto24_auth_token',
};

/**
 * Generates a unique, persistent pseudo-UUID for the device
 */
function generateDeviceId() {
  const rand = Math.random().toString(36).substring(2, 10);
  const timestamp = Date.now().toString(36);
  return `auto24_${rand}_${timestamp}`;
}

/**
 * Retrieves the device ID or creates and stores one if none exists.
 */
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

/**
 * Save driver registration profile
 */
export async function saveDriverProfile(profile) {
  try {
    await AsyncStorage.setItem(KEYS.DRIVER_PROFILE, JSON.stringify(profile));
  } catch (err) {
    console.error('Error saving driver profile:', err);
  }
}

/**
 * Get stored driver registration profile
 */
export async function getDriverProfile() {
  try {
    const raw = await AsyncStorage.getItem(KEYS.DRIVER_PROFILE);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error('Error loading driver profile:', err);
    return null;
  }
}

/**
 * Update and store approval status
 */
export async function saveStatus(status) {
  try {
    await AsyncStorage.setItem(KEYS.REGISTRATION_STATUS, status);
  } catch (err) {
    console.error('Error saving status:', err);
  }
}

/**
 * Save driver authentication token
 */
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

/**
 * Get stored driver authentication token
 */
export async function getAuthToken() {
  try {
    return await AsyncStorage.getItem(KEYS.AUTH_TOKEN);
  } catch (err) {
    console.error('Error loading auth token:', err);
    return null;
  }
}

/**
 * Clear local session (useful for resetting registration)
 */
export async function clearSession() {
  try {
    await AsyncStorage.multiRemove([
      KEYS.DRIVER_PROFILE,
      KEYS.REGISTRATION_STATUS,
      KEYS.AUTH_TOKEN,
    ]);
  } catch (err) {
    console.error('Error clearing storage session:', err);
  }
}
