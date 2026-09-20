/**
 * Auto 24 - Virtual Driver Simulator
 *
 * Useful for development and testing: Simulates a driver device registering,
 * waiting for approval, and driving along coordinates, transmitting GPS
 * updates every 3 seconds to the backend.
 *
 * Usage:
 *   node scripts/simulate-driver.js
 */

const http = require('http');

const PORT = process.env.PORT || 3000;
const DEVICE_ID = `sim_device_${Date.now()}`;

function request(method, path, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: 'localhost',
        port: PORT,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...extraHeaders,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, data: raw });
          }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// Waypoints simulating driving in a loop
const WAYPOINTS = [
  { lat: 12.971598, lng: 77.594562 },
  { lat: 12.971950, lng: 77.594800 },
  { lat: 12.972400, lng: 77.595100 },
  { lat: 12.972900, lng: 77.595450 },
  { lat: 12.973450, lng: 77.595800 },
  { lat: 12.973950, lng: 77.596200 },
  { lat: 12.974400, lng: 77.596650 },
  { lat: 12.974000, lng: 77.597100 },
  { lat: 12.973300, lng: 77.597300 },
  { lat: 12.972600, lng: 77.597100 },
  { lat: 12.972000, lng: 77.596600 },
  { lat: 12.971598, lng: 77.594562 },
];

async function main() {
  console.log(`[Simulator] Registering virtual driver with device_id: ${DEVICE_ID}...`);

  const regRes = await request('POST', '/register-driver', {
    name: 'Virtual Driver (Sim)',
    phone: '+91 99999 88888',
    vehicle_no: 'SIM-AUTO-24',
    device_id: DEVICE_ID,
  });

  if (regRes.status !== 201) {
    console.error('[Simulator] Registration failed:', regRes.data);
    process.exit(1);
  }

  const driverId = regRes.data.driver.driver_id;
  console.log(`[Simulator] Driver registered! ID: ${driverId}, Status: PENDING.`);
  console.log(`[Simulator] To approve this driver, run in another terminal:`);
  console.log(`            npm run approve ${driverId} approved\n`);

  console.log('[Simulator] Polling for approval every 3 seconds...');

  let approved = false;
  let authToken = null;
  while (!approved) {
    await new Promise((r) => setTimeout(r, 3000));
    const statusRes = await request('GET', `/registration-status/${DEVICE_ID}`);
    if (statusRes.data && statusRes.data.status === 'approved') {
      approved = true;
      authToken = statusRes.data.auth_token;
      console.log('✅ [Simulator] Driver APPROVED with Token! Starting location broadcast...');
    } else {
      process.stdout.write('.');
    }
  }

  let index = 0;
  setInterval(async () => {
    const point = WAYPOINTS[index % WAYPOINTS.length];
    index++;

    try {
      const updateRes = await request(
        'POST',
        '/update-location',
        {
          device_id: DEVICE_ID,
          lat: point.lat,
          lng: point.lng,
          timestamp: Date.now(),
        },
        authToken ? { Authorization: `Bearer ${authToken}` } : {}
      );

      console.log(
        `[Simulator] Transmitted (${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}) -> Status: [${updateRes.data.moving_status.toUpperCase()}] Speed: ${updateRes.data.speedKmh} km/h`
      );
    } catch (err) {
      console.error('[Simulator] Update error:', err.message);
    }
  }, 3000);
}

main().catch(console.error);
