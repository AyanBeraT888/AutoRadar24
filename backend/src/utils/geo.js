/**
 * Geo calculation utilities for Auto 24
 * Provides Haversine distance computation and moving status evaluation.
 */

const EARTH_RADIUS_METERS = 6371000;

/**
 * Converts degrees to radians.
 * @param {number} deg
 * @returns {number}
 */
function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Calculates the great-circle distance between two geographic coordinates using the Haversine formula.
 * @param {number} lat1 Latitude of point 1 (in degrees)
 * @param {number} lon1 Longitude of point 1 (in degrees)
 * @param {number} lat2 Latitude of point 2 (in degrees)
 * @param {number} lon2 Longitude of point 2 (in degrees)
 * @returns {number} Distance in meters
 */
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) {
    return 0;
  }

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
    Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Computes moving_status ("moving" or "idle") based on coordinate delta and elapsed time.
 * @param {object} previousCoords - { lat, lng, last_updated }
 * @param {object} currentCoords - { lat, lng, timestamp }
 * @param {object} options - { minDistanceMeters, minSpeedKmh }
 * @returns {{ moving_status: 'moving' | 'idle', distanceMeters: number, speedKmh: number }}
 */
function determineMovingStatus(previousCoords, currentCoords, options = {}) {
  const minDistanceMeters = options.minDistanceMeters ?? 7;
  const minSpeedKmh = options.minSpeedKmh ?? 3;

  if (
    !previousCoords ||
    previousCoords.lat == null ||
    previousCoords.lng == null
  ) {
    // First location point recorded, assume idle until next point establishes velocity
    return {
      moving_status: 'idle',
      distanceMeters: 0,
      speedKmh: 0,
    };
  }

  const distanceMeters = calculateDistanceMeters(
    previousCoords.lat,
    previousCoords.lng,
    currentCoords.lat,
    currentCoords.lng
  );

  const prevTime = previousCoords.last_updated || Date.now();
  const currTime = currentCoords.timestamp || Date.now();
  const timeDeltaSeconds = Math.max(1, Math.abs(currTime - prevTime) / 1000);

  // Speed = distance (m) / time (s) * 3.6 (km/h)
  const speedKmh = (distanceMeters / timeDeltaSeconds) * 3.6;

  // Driver is considered moving only if both distance and speed exceed threshold
  // This filters out GPS jitter while vehicle is stopped at a traffic light or parked
  const isMoving = distanceMeters >= minDistanceMeters && speedKmh >= minSpeedKmh;

  return {
    moving_status: isMoving ? 'moving' : 'idle',
    distanceMeters: Math.round(distanceMeters * 100) / 100,
    speedKmh: Math.round(speedKmh * 10) / 10,
  };
}

/**
 * Pure Backend Traffic Jam Inference Engine
 *
 * IF multiple drivers (>= 2) within a small geographic radius (e.g. 200m)
 * ALL show low/zero speed for a sustained period (e.g. 2+ minutes)
 * -> infer "traffic jam" in that area, not individual idle status.
 *
 * Zero device-to-device communication, zero Bluetooth cost, scales naturally with fleet.
 *
 * @param {Array<object>} drivers - List of active driver payloads
 * @param {Map<string, { first_slow_time: number, lat: number, lng: number }>} stationaryTracker
 * @param {object} options - { radiusMeters: 200, minDrivers: 2, maxSpeedKmh: 4, sustainedMs: 120000 }
 * @returns {{ trafficJams: Array<object>, jammedDriverIds: Set<number|string> }}
 */
function detectTrafficJams(drivers, stationaryTracker, options = {}) {
  const radiusMeters = options.radiusMeters || 200;
  const minDrivers = options.minDrivers || 2;
  const maxSpeedKmh = options.maxSpeedKmh || 4;
  const sustainedMs = options.sustainedMs || 120000; // 2 minutes
  const now = Date.now();

  const jammedDriverIds = new Set();
  const trafficJams = [];
  const candidates = [];

  for (const driver of drivers) {
    if (!driver || driver.lat == null || driver.lng == null) continue;
    const deviceId = driver.device_id || String(driver.driver_id);
    const speed = driver.speed_kmh != null ? Number(driver.speed_kmh) : 0;
    const isSlow = speed <= maxSpeedKmh || driver.moving_status === 'idle';

    if (!stationaryTracker.has(deviceId)) {
      if (isSlow) {
        stationaryTracker.set(deviceId, {
          first_slow_time: now,
          lat: Number(driver.lat),
          lng: Number(driver.lng),
        });
      }
    } else {
      const entry = stationaryTracker.get(deviceId);
      const distFromStart = calculateDistanceMeters(entry.lat, entry.lng, Number(driver.lat), Number(driver.lng));

      if (!isSlow && distFromStart > 40) {
        // Driver broke out of congestion and moved away
        stationaryTracker.delete(deviceId);
      } else {
        const timeSlow = now - entry.first_slow_time;
        if (timeSlow >= sustainedMs) {
          candidates.push({
            driver_id: driver.driver_id,
            device_id: deviceId,
            lat: Number(driver.lat),
            lng: Number(driver.lng),
            durationMs: timeSlow,
          });
        }
      }
    }
  }

  // Cluster slow candidates within geographic radius
  const visited = new Set();

  for (let i = 0; i < candidates.length; i++) {
    const c1 = candidates[i];
    if (visited.has(c1.driver_id)) continue;

    const cluster = [c1];
    visited.add(c1.driver_id);

    for (let j = i + 1; j < candidates.length; j++) {
      const c2 = candidates[j];
      if (visited.has(c2.driver_id)) continue;

      const dist = calculateDistanceMeters(c1.lat, c1.lng, c2.lat, c2.lng);
      if (dist <= radiusMeters) {
        cluster.push(c2);
        visited.add(c2.driver_id);
      }
    }

    if (cluster.length >= minDrivers) {
      const avgLat = cluster.reduce((sum, c) => sum + c.lat, 0) / cluster.length;
      const avgLng = cluster.reduce((sum, c) => sum + c.lng, 0) / cluster.length;
      const jamId = `jam_${Math.round(avgLat * 1000)}_${Math.round(avgLng * 1000)}`;

      const jamObj = {
        jam_id: jamId,
        center: { lat: avgLat, lng: avgLng },
        radius_meters: radiusMeters,
        driver_count: cluster.length,
        driver_ids: cluster.map((c) => c.driver_id),
      };

      trafficJams.push(jamObj);
      cluster.forEach((c) => jammedDriverIds.add(c.driver_id));
    }
  }

  return { trafficJams, jammedDriverIds };
}

module.exports = {
  calculateDistanceMeters,
  determineMovingStatus,
  detectTrafficJams,
};
