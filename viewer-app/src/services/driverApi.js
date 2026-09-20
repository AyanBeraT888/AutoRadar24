/**
 * Backend API Client for Auto 24 Driver Features
 * Dynamically synchronizes with the user-selected server URL.
 */

import { getServerUrl, saveAuthToken, getAuthToken } from './storage';

/**
 * Helper to fetch the current active server URL
 */
async function getBaseUrl() {
  return await getServerUrl();
}

/**
 * Register driver with backend
 */
export async function registerDriverApi({ name, phone, vehicle_no, device_id }) {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/register-driver`, {
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
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/registration-status/${deviceId}`, {
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
  const baseUrl = await getBaseUrl();
  const token = auth_token || (await getAuthToken());

  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${baseUrl}/update-location`, {
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
