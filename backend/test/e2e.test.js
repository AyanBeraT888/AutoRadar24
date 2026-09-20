/**
 * Auto 24 - End-to-End Backend Verification Test
 */

const assert = require('node:assert');
const http = require('node:http');
const app = require('../src/server');
const db = require('../src/db');

const TEST_PORT = 3456;
let server;

function makeRequest(method, path, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: 'localhost',
        port: TEST_PORT,
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
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode, data: parsed });
        });
      }
    );

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting Auto 24 Backend E2E Tests ---');

  server = app.listen(TEST_PORT);
  await new Promise((resolve) => server.once('listening', resolve));
  console.log(`Test server running on port ${TEST_PORT}`);

  const testDeviceId = `test_device_${Date.now()}`;
  let driverId;

  try {
    // 1. Register Driver
    console.log('\n1. Testing POST /register-driver...');
    const regRes = await makeRequest('POST', '/register-driver', {
      name: 'Ramesh Kumar',
      phone: '+919876543210',
      vehicle_no: 'KA-04-E-2024',
      device_id: testDeviceId,
    });
    assert.strictEqual(regRes.status, 201);
    assert.strictEqual(regRes.data.driver.status, 'pending');
    driverId = regRes.data.driver.driver_id;
    console.log(`✓ Driver registered with ID: ${driverId}, status: 'pending'`);

    // 2. Poll Status
    console.log('\n2. Testing GET /registration-status/:device_id...');
    const statusRes = await makeRequest('GET', `/registration-status/${testDeviceId}`);
    assert.strictEqual(statusRes.status, 200);
    assert.strictEqual(statusRes.data.status, 'pending');
    console.log(`✓ Registration status is 'pending'`);

    // 3. Location Update without Token (MUST BE REJECTED with 401)
    console.log('\n3. Testing POST /update-location without token...');
    const noTokenRes = await makeRequest('POST', '/update-location', {
      device_id: testDeviceId,
      lat: 12.9715987,
      lng: 77.5945627,
      timestamp: Date.now(),
    });
    assert.strictEqual(noTokenRes.status, 401);
    console.log(`✓ Correctly rejected unauthenticated update with 401 Unauthorized`);

    // 4. Approve Driver Directly in DB
    console.log('\n4. Approving driver directly in database and obtaining auth token...');
    db.setDriverStatus(driverId, 'approved');
    const verifyApproved = await makeRequest('GET', `/registration-status/${testDeviceId}`);
    assert.strictEqual(verifyApproved.data.status, 'approved');
    assert(verifyApproved.data.auth_token, 'Should return signed auth_token upon approval');
    const validToken = verifyApproved.data.auth_token;
    console.log(`✓ Driver status flipped to 'approved' and received signed token: ${validToken.substring(0, 20)}...`);

    // 4b. Test Tampered Token (MUST BE REJECTED with 401)
    console.log('\n4b. Testing POST /update-location with forged/tampered token...');
    const tamperedRes = await makeRequest(
      'POST',
      '/update-location',
      {
        device_id: testDeviceId,
        lat: 12.971598,
        lng: 77.594562,
        timestamp: Date.now(),
      },
      { Authorization: 'Bearer forged.invalid.signature' }
    );
    assert.strictEqual(tamperedRes.status, 401);
    console.log(`✓ Correctly rejected forged token with 401 Unauthorized`);

    // 5. Send First Authenticated Location Update
    console.log('\n5. Sending first authenticated location update...');
    const firstLocTime = Date.now();
    const locRes1 = await makeRequest(
      'POST',
      '/update-location',
      {
        device_id: testDeviceId,
        lat: 12.971598,
        lng: 77.594562,
        timestamp: firstLocTime,
      },
      { Authorization: `Bearer ${validToken}` }
    );
    assert.strictEqual(locRes1.status, 200);
    assert.strictEqual(locRes1.data.moving_status, 'idle');
    console.log(`✓ First authenticated location recorded, moving_status: 'idle'`);

    // 6. Send Second Location Update (Simulate vehicle moving 50 meters north in 3 seconds)
    console.log('\n6. Sending second authenticated location update (moving ~50m)...');
    const secondLocTime = firstLocTime + 3000;
    const locRes2 = await makeRequest(
      'POST',
      '/update-location',
      {
        device_id: testDeviceId,
        lat: 12.972050,
        lng: 77.594562,
        timestamp: secondLocTime,
      },
      { Authorization: `Bearer ${validToken}` }
    );
    assert.strictEqual(locRes2.status, 200);
    assert.strictEqual(locRes2.data.moving_status, 'moving');
    assert(locRes2.data.distanceMeters > 30, 'Distance should be > 30m');
    console.log(`✓ Vehicle movement detected: ${locRes2.data.distanceMeters}m @ ${locRes2.data.speedKmh} km/h -> moving_status: 'moving'`);

    // 7. Viewer queries /driver/:id
    console.log('\n7. Testing GET /driver/:id for viewers...');
    const viewerRes = await makeRequest('GET', `/driver/${driverId}`);
    assert.strictEqual(viewerRes.status, 200);
    assert.strictEqual(viewerRes.data.moving_status, 'moving');
    assert.strictEqual(viewerRes.data.is_live, true);
    console.log(`✓ Viewer received driver location with live moving_status: 'moving'`);

    // 8. Test 15-second idle staleness
    console.log('\n8. Testing 15-second idle staleness rule...');
    // Update DB last_updated to 20 seconds ago
    db.updateLocation(testDeviceId, 12.972050, 77.594562, 'moving', Date.now() - 20000);
    const staleViewerRes = await makeRequest('GET', `/driver/${driverId}`);
    assert.strictEqual(staleViewerRes.data.moving_status, 'idle');
    assert.strictEqual(staleViewerRes.data.is_live, false);
    console.log(`✓ Driver without updates for >15s automatically reported as 'idle' and is_live: false`);

    // 9. Pure Backend Traffic Jam Inference Test
    console.log('\n9. Testing pure backend Traffic Jam cluster inference (2+ drivers within 200m stopped > 2 min)...');
    const { detectTrafficJams } = require('../src/utils/geo');
    const mockTracker = new Map();
    const t0 = Date.now() - 130000; // 130 seconds ago (> 2 minutes)

    const driverA = { driver_id: 101, device_id: 'auto_a', lat: 12.97150, lng: 77.59450, moving_status: 'idle', speed_kmh: 0 };
    const driverB = { driver_id: 102, device_id: 'auto_b', lat: 12.97190, lng: 77.59450, moving_status: 'idle', speed_kmh: 0 }; // ~44m away

    // First sighting 130s ago
    mockTracker.set('auto_a', { first_slow_time: t0, lat: 12.97150, lng: 77.59450 });
    mockTracker.set('auto_b', { first_slow_time: t0, lat: 12.97190, lng: 77.59450 });

    const jamResult = detectTrafficJams([driverA, driverB], mockTracker, { radiusMeters: 200, minDrivers: 2, sustainedMs: 120000 });
    assert.strictEqual(jamResult.trafficJams.length, 1, 'Should detect 1 traffic jam cluster');
    assert(jamResult.jammedDriverIds.has(101), 'Driver A should be flagged as jammed');
    assert(jamResult.jammedDriverIds.has(102), 'Driver B should be flagged as jammed');
    assert.strictEqual(jamResult.trafficJams[0].driver_count, 2);
    console.log(`✓ Traffic jam detected across ${jamResult.trafficJams[0].driver_count} vehicles within ${jamResult.trafficJams[0].radius_meters}m sustained for >2 min`);

    console.log('\n🎉 ALL BACKEND TESTS PASSED SUCCESSFULLY!\n');
  } catch (err) {
    console.error('\n❌ Test failed:', err);
    process.exitCode = 1;
  } finally {
    if (server) {
      server.close();
    }
  }
}

runTests();
