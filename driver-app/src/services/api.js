/**
 * Backend API Client for Auto 24 Driver App
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { saveAuthToken, getAuthToken } from './storage';

function getDefaultBaseUrl() {
  // 1. Build-time environment variable (e.g. Cloudflare Tunnel or Render URL)
  if (process.env.EXPO_PUBLIC_API_URL && process.env.EXPO_PUBLIC_API_URL.trim()) {
    return process.env.EXPO_PUBLIC_API_URL.trim().replace(/\/+$/, '');
  }

  // 2. Auto-detect host machine LAN IP when running in Expo Go on physical device
  const hostUri = Constants.expoConfig?.hostUri 
    || Constants.manifest2?.extra?.expoClient?.hostUri 
    || Constants.manifest?.debuggerHost;

  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:3000`;
    }
  }

  // 3. Fallback: Android emulator uses 10.0.2.2, desktop/iOS simulator uses localhost
  return Platform.select({
    android: 'http://10.0.2.2:3000',
    default: 'http://localhost:3000',
  });
}

let customBaseUrl = getDefaultBaseUrl();

export function setApiBaseUrl(url) {
  if (url && url.trim()) {
    customBaseUrl = url.trim().replace(/\/+$/, '');
  }
}

export function getApiBaseUrl() {
  return customBaseUrl;
}

/**
 * Register driver with backend
 */
export async function registerDriverApi({ name, phone, vehicle_no, device_id }) {
  const res = await fetch(`${customBaseUrl}/register-driver`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, phone, vehicle_no, device_id }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to register driver');
  }
  return data;
}

/**
 * Poll registration approval status
 */
export async function getRegistrationStatusApi(deviceId) {
  const res = await fetch(`${customBaseUrl}/registration-status/${deviceId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (res.status === 404) {
    return { notFound: true, status: 'unregistered' };
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch status');
  }

  if (data.auth_token) {
    await saveAuthToken(data.auth_token);
  }

  return data;
}

/**
 * Post live GPS location
 * Backend will return 403 Forbidden if driver is not approved.
 */
export async function updateLocationApi({ device_id, lat, lng, timestamp, auth_token = null }) {
  const token = auth_token || (await getAuthToken());

  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${customBaseUrl}/update-location`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      device_id,
      lat,
      lng,
      timestamp: timestamp || Date.now(),
      ...(token ? { auth_token: token } : {}),
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const error = new Error(data.error || 'Failed to update location');
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}
