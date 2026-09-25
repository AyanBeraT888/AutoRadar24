/**
 * Auto 24 - Live Driver Location Tracking Server
 * Minimalist, high-performance Node.js REST API.
 */

require('dotenv').config();
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const express = require('express');
const cors = require('cors');
const db = require('./db');
const { determineMovingStatus, detectTrafficJams } = require('./utils/geo');
const { generateDriverToken, requireDriverAuth } = require('./utils/auth');
const { createRateLimiter } = require('./utils/rateLimit');

const app = express();
const PORT = process.env.PORT || 3000;
const IDLE_TIMEOUT_SECONDS = parseInt(process.env.IDLE_TIMEOUT_SECONDS || '15', 10);
const MOVEMENT_THRESHOLD_METERS = parseFloat(process.env.MOVEMENT_THRESHOLD_METERS || '7');
const SPEED_THRESHOLD_KMH = parseFloat(process.env.SPEED_THRESHOLD_KMH || '5');

// Production reverse proxy support (Caddy, Nginx, Cloudflare)
app.set('trust proxy', 1);

// Production Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Middleware
app.use(cors());
app.use(express.json());

// Rate Limiters
const globalLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 300,
  message: 'Too many requests, please slow down.',
});
const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 15,
  message: 'Too many registration requests from this IP. Please try again later.',
});
const locationLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 45,
  message: 'Too many location updates. Maximum allowed frequency is 1 update per 2 seconds.',
  keyGenerator: (req) => (req.body && req.body.device_id) || req.ip,
});

app.use(globalLimiter);

// Serve static web viewer files directly
const VIEWER_DIR = path.join(__dirname, '../../web-viewer');
app.use(express.static(VIEWER_DIR));

// In-memory cache for recent driver coordinates to calculate deltas accurately
// Map<device_id, { lat, lng, timestamp, moving_status }>
const previousLocations = new Map();

// In-memory stationary tracking for backend traffic jam inference (0 phone battery impact)
// Map<device_id, { first_slow_time: number, lat: number, lng: number }>
const stationaryTracker = new Map();

/**
 * Helper to compute effective moving_status:
 * If last update is older than IDLE_TIMEOUT_SECONDS (15s), moving_status is 'idle'.
 * If part of a detected multi-driver congestion cluster, moving_status is 'jammed'.
 */
function getEffectiveDriverPayload(driver, jammedDriverIds = new Set()) {
  if (!driver) return null;

  const now = Date.now();
  const lastUpdated = driver.last_updated ? Number(driver.last_updated) : 0;
  const isStale = !lastUpdated || (now - lastUpdated) > (IDLE_TIMEOUT_SECONDS * 1000);
  const isJammed = jammedDriverIds.has(driver.driver_id) || jammedDriverIds.has(driver.device_id);

  let movingStatus = isStale ? 'idle' : driver.moving_status;
  if (isJammed && movingStatus === 'idle') {
    movingStatus = 'jammed';
  }

  return {
    driver_id: driver.driver_id,
    device_id: driver.device_id,
    name: driver.name,
    vehicle_no: driver.vehicle_no,
    status: driver.status,
    lat: driver.lat,
    lng: driver.lng,
    moving_status: movingStatus,
    in_traffic_jam: isJammed,
    last_updated: driver.last_updated,
    is_live: !isStale,
  };
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'AutoRadar18 Backend', timestamp: Date.now() });
});

/**
 * POST /register-driver
 * Driver self-registers. Default status: "pending"
 * Body: { name, phone, vehicle_no, device_id }
 */
app.post('/register-driver', registerLimiter, async (req, res) => {
  try {
    const { name, phone, vehicle_no, device_id } = req.body;

    if (!name || !phone || !vehicle_no || !device_id) {
      return res.status(400).json({
        error: 'Missing required fields. Provide name, phone, vehicle_no, and device_id.',
      });
    }

    const driver = await db.registerDriver({
      name: name.trim(),
      phone: phone.trim(),
      vehicle_no: vehicle_no.trim().toUpperCase(),
      device_id: device_id.trim(),
    });

    const authToken = generateDriverToken({
      driver_id: driver.driver_id,
      device_id: driver.device_id,
      status: 'approved',
    });

    res.status(201).json({
      success: true,
      message: 'Driver registration automatically approved.',
      driver: {
        driver_id: driver.driver_id,
        name: driver.name,
        phone: driver.phone,
        vehicle_no: driver.vehicle_no,
        device_id: driver.device_id,
        status: 'approved',
      },
      auth_token: authToken,
    });
  } catch (err) {
    console.error('Error in /register-driver:', err);
    res.status(500).json({ error: 'Internal server error registering driver' });
  }
});

/**
 * GET /registration-status/:device_id
 * Polled by driver app to check approval status.
 */
app.get('/registration-status/:device_id', async (req, res) => {
  try {
    const { device_id } = req.params;
    const driver = await db.getDriverByDeviceId(device_id);

    if (!driver) {
      return res.status(404).json({ error: 'Device not registered' });
    }

    const isApproved = driver.status === 'approved';
    const authToken = isApproved
      ? generateDriverToken({
          driver_id: driver.driver_id,
          device_id: driver.device_id,
          status: driver.status,
        })
      : null;

    res.json({
      driver_id: driver.driver_id,
      device_id: driver.device_id,
      name: driver.name,
      vehicle_no: driver.vehicle_no,
      status: driver.status, // "pending" | "approved" | "rejected"
      ...(authToken ? { auth_token: authToken } : {}),
    });
  } catch (err) {
    console.error('Error in /registration-status:', err);
    res.status(500).json({ error: 'Internal server error checking status' });
  }
});

/**
 * POST /update-location
 * Driver app posts live GPS coords every 3-5 seconds.
 * REJECTED if driver is not approved or lacks a valid cryptographic auth token.
 * Body: { device_id, lat, lng, timestamp }
 * Header: Authorization: Bearer <auth_token>
 */
app.post('/update-location', locationLimiter, requireDriverAuth, async (req, res) => {
  try {
    const { device_id, lat, lng, timestamp } = req.body;

    if (!device_id || lat == null || lng == null) {
      return res.status(400).json({ error: 'device_id, lat, and lng are required.' });
    }

    const driver = await db.getDriverByDeviceId(device_id);
    if (!driver) {
      return res.status(404).json({ error: 'Driver device not found' });
    }

    // Strict requirement: Backend REJECTS update if status is not 'approved'
    if (driver.status !== 'approved') {
      return res.status(403).json({
        error: 'Forbidden: Driver registration is not approved',
        status: driver.status,
      });
    }

    const now = timestamp ? Number(timestamp) : Date.now();
    const prevLocation = previousLocations.get(device_id) || {
      lat: driver.lat,
      lng: driver.lng,
      last_updated: driver.last_updated,
    };

    const currentCoords = { lat: Number(lat), lng: Number(lng), timestamp: now };
    const { moving_status, distanceMeters, speedKmh } = determineMovingStatus(
      prevLocation,
      currentCoords,
      {
        minDistanceMeters: MOVEMENT_THRESHOLD_METERS,
        minSpeedKmh: SPEED_THRESHOLD_KMH,
      }
    );

    // Save to DB
    await db.updateLocation(device_id, Number(lat), Number(lng), moving_status, now);

    // Update in-memory tracker
    previousLocations.set(device_id, {
      lat: Number(lat),
      lng: Number(lng),
      last_updated: now,
      moving_status,
    });

    res.json({
      success: true,
      moving_status,
      distanceMeters,
      speedKmh,
      timestamp: now,
    });
  } catch (err) {
    console.error('Error in /update-location:', err);
    res.status(500).json({ error: 'Internal server error updating location' });
  }
});

/**
 * GET /driver/:id
 * Viewers check driver's live position and moving status.
 * If no update received in 15 seconds, moving_status is returned as "idle".
 * If driver is stuck in a detected traffic jam cluster (2+ drivers within 200m for 2+ min),
 * moving_status is returned as "jammed" and in_traffic_jam is true.
 */
app.get('/driver/:id', async (req, res) => {
  try {
    const driverId = parseInt(req.params.id, 10);
    const driver = isNaN(driverId)
      ? await db.getDriverByDeviceId(req.params.id)
      : await db.getDriverById(driverId);

    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    // Evaluate jams across all active drivers
    const allApproved = await db.getAllDrivers('approved');
    const { jammedDriverIds } = detectTrafficJams(allApproved, stationaryTracker);

    const payload = getEffectiveDriverPayload(driver, jammedDriverIds);
    res.json(payload);
  } catch (err) {
    console.error('Error in /driver/:id:', err);
    res.status(500).json({ error: 'Internal server error fetching driver' });
  }
});

/**
 * GET /drivers
 * Returns list of drivers (useful for viewers and testing).
 * In-memory cluster evaluation detects traffic jams with zero phone battery overhead.
 */
app.get('/drivers', async (req, res) => {
  try {
    const { status } = req.query;
    const drivers = await db.getAllDrivers(status || null);

    const { jammedDriverIds } = detectTrafficJams(drivers, stationaryTracker);
    const result = drivers.map((d) => getEffectiveDriverPayload(d, jammedDriverIds));

    res.json(result);
  } catch (err) {
    console.error('Error in /drivers:', err);
    res.status(500).json({ error: 'Internal server error listing drivers' });
  }
});

/**
 * GET /traffic-jams
 * Returns list of currently active traffic jam clusters across the network.
 */
app.get('/traffic-jams', async (req, res) => {
  try {
    const approvedDrivers = await db.getAllDrivers('approved');
    const { trafficJams } = detectTrafficJams(approvedDrivers, stationaryTracker);
    res.json({
      traffic_jams: trafficJams,
      count: trafficJams.length,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('Error in /traffic-jams:', err);
    res.status(500).json({ error: 'Internal server error fetching traffic jams' });
  }
});

// Start server if run directly
if (require.main === module) {
  const sslKeyPath = process.env.SSL_KEY_PATH;
  const sslCertPath = process.env.SSL_CERT_PATH;
  const useHttps = sslKeyPath && sslCertPath && fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath);

  if (useHttps) {
    const sslOptions = {
      key: fs.readFileSync(sslKeyPath),
      cert: fs.readFileSync(sslCertPath),
    };
    https.createServer(sslOptions, app).listen(PORT, () => {
      console.log(`[Auto 24 Backend] Secure HTTPS Server listening on port ${PORT}`);
      console.log(`[Auto 24 Backend] Idle timeout: ${IDLE_TIMEOUT_SECONDS}s`);
    });
  } else {
    http.createServer(app).listen(PORT, () => {
      console.log(`[Auto 24 Backend] HTTP Server listening on port ${PORT}`);
      console.log(`[Auto 24 Backend] Idle timeout: ${IDLE_TIMEOUT_SECONDS}s`);
    });
  }
}

module.exports = app;
