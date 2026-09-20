/**
 * Auto 24 Driver Mode - MEMS Motion & Compass Sensor Service
 * Reads hardware Accelerometer and Magnetometer to measure vehicle dynamics,
 * vibration, and heading angle.
 */

import { Accelerometer, Magnetometer } from 'expo-sensors';

let accelSubscription = null;
let magSubscription = null;

const MOTION_BUFFER_SIZE = 5;
const motionBuffer = [];

let currentMetrics = {
  acceleration: { x: 0, y: 0, z: 0 },
  motionIntensity: 0,
  headingDegrees: 0,
  isSustainedMotion: false,
};

const listeners = new Set();

export function subscribeToSensorMetrics(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notifySensorListeners() {
  listeners.forEach((cb) => {
    try {
      cb({ ...currentMetrics });
    } catch {}
  });
}

export function isSustainedMotion() {
  if (motionBuffer.length < 3) return false;
  const activeSamples = motionBuffer.filter((m) => m >= 0.07);
  return activeSamples.length >= 3;
}

export async function startSensorTracking() {
  try {
    Accelerometer.setUpdateInterval(500);
    Magnetometer.setUpdateInterval(500);

    if (!accelSubscription) {
      accelSubscription = Accelerometer.addListener((data) => {
        const { x, y, z } = data;
        const magnitude = Math.sqrt(x * x + y * y + z * z);
        const dynamicMotion = Math.abs(magnitude - 1.0);

        motionBuffer.push(dynamicMotion);
        if (motionBuffer.length > MOTION_BUFFER_SIZE) {
          motionBuffer.shift();
        }

        const sustained = isSustainedMotion();

        currentMetrics.acceleration = { x, y, z };
        currentMetrics.motionIntensity = Math.round(dynamicMotion * 100) / 100;
        currentMetrics.isSustainedMotion = sustained;

        notifySensorListeners();
      });
    }

    if (!magSubscription) {
      magSubscription = Magnetometer.addListener((data) => {
        let { x, y } = data;
        let angle = Math.atan2(y, x) * (180 / Math.PI);
        if (angle < 0) {
          angle += 360;
        }
        currentMetrics.headingDegrees = Math.round(angle);
        notifySensorListeners();
      });
    }
  } catch (err) {
    console.warn('Sensors not available or permission denied:', err);
  }
}

export function stopSensorTracking() {
  if (accelSubscription) {
    accelSubscription.remove();
    accelSubscription = null;
  }
  if (magSubscription) {
    magSubscription.remove();
    magSubscription = null;
  }
  motionBuffer.length = 0;
}

export function getSensorMetrics() {
  return {
    ...currentMetrics,
    isSustainedMotion: isSustainedMotion(),
  };
}
