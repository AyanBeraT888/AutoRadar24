/**
 * Location Tracking Service for Auto 24 Driver Mode
 * Manages foreground service and background GPS location updates via expo-location & expo-task-manager.
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { updateLocationApi } from './driverApi';
import { getOrCreateDeviceId } from './storage';
import { startSensorTracking, stopSensorTracking, getSensorMetrics } from './driverSensors';

export const LOCATION_TASK_NAME = 'AUTO24_BACKGROUND_LOCATION_TASK';

const locationListeners = new Set();

export function subscribeToLocationUpdates(callback) {
  locationListeners.add(callback);
  return () => locationListeners.delete(callback);
}

function notifyListeners(data) {
  locationListeners.forEach((listener) => {
    try {
      listener(data);
    } catch (err) {
      console.error('Error in location listener:', err);
    }
  });
}

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

let lastSentTime = 0;
let lastSentCoords = null;

const HIGH_FREQ_THROTTLE_MS = 3000;
const HEARTBEAT_THROTTLE_MS = 35000;
const SLOW_CRAWL_DISTANCE_METERS = 15;

// Define background task
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('[LocationTask] Background location error:', error);
    notifyListeners({ error: error.message });
    return;
  }

  if (data && data.locations && data.locations.length > 0) {
    const location = data.locations[data.locations.length - 1];
    const now = Date.now();
    const { latitude, longitude, speed } = location.coords;

    const sensorData = getSensorMetrics();
    const hasMotion = sensorData.isSustainedMotion;

    const distanceMoved = lastSentCoords
      ? getDistanceMeters(lastSentCoords.lat, lastSentCoords.lng, latitude, longitude)
      : 999;

    // IF accelerometer shows sustained motion OR distance change >= 15m (slow crawl) OR GPS speed >= 5 km/h:
    const isMoving = hasMotion || distanceMoved >= SLOW_CRAWL_DISTANCE_METERS || (speed != null && (speed * 3.6) >= 5);
    const requiredInterval = isMoving ? HIGH_FREQ_THROTTLE_MS : HEARTBEAT_THROTTLE_MS;

    if (now - lastSentTime < requiredInterval) {
      return;
    }

    lastSentTime = now;
    lastSentCoords = { lat: latitude, lng: longitude };

    try {
      const deviceId = await getOrCreateDeviceId();
      const response = await updateLocationApi({
        device_id: deviceId,
        lat: latitude,
        lng: longitude,
        timestamp: now,
      });

      const sensorData = getSensorMetrics();
      notifyListeners({
        lat: latitude,
        lng: longitude,
        speed: speed ?? 0,
        heading: sensorData.headingDegrees,
        motionIntensity: sensorData.motionIntensity,
        moving_status: response.moving_status,
        last_updated: now,
        success: true,
      });
    } catch (apiErr) {
      console.error('[LocationTask] Failed to transmit location:', apiErr.message);
      notifyListeners({
        lat: latitude,
        lng: longitude,
        error: apiErr.message,
        success: false,
      });
    }
  }
});

export async function requestLocationPermissions() {
  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
  if (foregroundStatus !== 'granted') {
    return {
      granted: false,
      error: 'Foreground location permission is required for live tracking.',
    };
  }

  const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
  if (backgroundStatus !== 'granted') {
    return {
      granted: false,
      error: 'Background location permission is required to track while screen is off.',
    };
  }

  return { granted: true };
}

export async function startTracking() {
  const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (hasStarted) {
    return true;
  }

  const permissions = await requestLocationPermissions();
  if (!permissions.granted) {
    throw new Error(permissions.error);
  }

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.High,
    timeInterval: 3000,
    distanceInterval: 2,
    deferredUpdatesInterval: 3000,
    showsBackgroundLocationIndicator: true,
    pausesLocationUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: 'Auto 24 Driver - Active On-Duty',
      notificationBody: 'Broadcasting live vehicle GPS & sensor telemetry',
      notificationColor: '#FFCC00',
      killServiceOnDestroy: false,
    },
  });

  try {
    await startSensorTracking();
  } catch (sensorErr) {
    console.warn('[LocationTask] MEMS sensor note:', sensorErr.message);
  }

  return true;
}

export async function stopTracking() {
  try {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  } catch (err) {
    console.warn('[LocationTask] Error stopping updates:', err);
  }
  stopSensorTracking();
  return true;
}

export async function isTrackingActive() {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch {
    return false;
  }
}
