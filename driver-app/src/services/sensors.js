/**
 * Auto 24 Driver App - MEMS Motion & Compass Sensor Service
 * Reads hardware Accelerometer and Magnetometer to measure vehicle dynamics,
 * vibration, sudden braking, and accurate heading angle.
 *
 * Implements sustained motion analysis to distinguish real vehicle movement
 * from single bumps/potholes.
 */

import { Accelerometer, Magnetometer } from 'expo-sensors';

let accelSubscription = null;
let magSubscription = null;

// History buffer of recent dynamic motion values (samples taken every 500ms)
const MOTION_BUFFER_SIZE = 5; // ~2.5 seconds window
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
    } catch (e) {}
  });
}

/**
 * Determine if motion is sustained (vehicle moving/engine running) vs a single bump
 * Threshold: dynamic G-force > 0.07 sustained across at least 3 of the last 5 samples
 */
export function isSustainedMotion() {
  if (motionBuffer.length < 3) return false;
  const activeSamples = motionBuffer.filter((m) => m >= 0.07);
  return activeSamples.length >= 3;
}

/**
 * Start MEMS motion & heading sensor tracking
 */
export async function startSensorTracking() {
  // Set sampling intervals (500ms for battery-efficient vehicle dynamics)
  Accelerometer.setUpdateInterval(500);
  Magnetometer.setUpdateInterval(500);

  if (!accelSubscription) {
    accelSubscription = Accelerometer.addListener((data) => {
      const { x, y, z } = data;
      // Calculate total G-force acceleration magnitude (1.0 = gravity resting)
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      const dynamicMotion = Math.abs(magnitude - 1.0);

      // Maintain rolling buffer
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
      // Calculate compass heading in degrees from magnetic field
      let angle = Math.atan2(y, x) * (180 / Math.PI);
      if (angle < 0) {
        angle += 360;
      }
      currentMetrics.headingDegrees = Math.round(angle);
      notifySensorListeners();
    });
  }
}

/**
 * Stop MEMS sensor tracking
 */
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

/**
 * Get snapshot of current MEMS metrics
 */
export function getSensorMetrics() {
  return {
    ...currentMetrics,
    isSustainedMotion: isSustainedMotion(),
  };
}
