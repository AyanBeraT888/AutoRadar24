#!/usr/bin/env node
/**
 * Auto 24 - Manual Driver Approval CLI Tool
 *
 * Flips the status field of a driver directly in the SQLite database.
 * No admin endpoint or web interface is used.
 *
 * Usage:
 *   node src/approve-driver.js <driver_id_or_device_id> [approved|rejected|pending]
 *   npm run approve <driver_id_or_device_id> [approved|rejected|pending]
 *
 * Example:
 *   node src/approve-driver.js 1 approved
 *   node src/approve-driver.js dev_abc123 approved
 *   node src/approve-driver.js list
 */

const db = require('./db');

const args = process.argv.slice(2);

(async () => {
  if (args.length === 0 || args[0] === 'list') {
    console.log('\n=== Auto 24 Registered Drivers ===');
    const drivers = await db.getAllDrivers();
  if (drivers.length === 0) {
    console.log('No drivers registered yet.');
  } else {
    console.table(
      drivers.map((d) => ({
        ID: d.driver_id,
        Name: d.name,
        Phone: d.phone,
        Vehicle: d.vehicle_no,
        DeviceID: d.device_id,
        Status: d.status,
        Moving: d.moving_status,
        LastUpdated: d.last_updated ? new Date(d.last_updated).toLocaleTimeString() : 'Never',
      }))
    );
  }
  console.log('\nTo update a driver status, run:');
  console.log('  node src/approve-driver.js <driver_id> approved\n');
  process.exit(0);
}

const identifier = args[0];
const targetStatus = (args[1] || 'approved').toLowerCase();

if (!['pending', 'approved', 'rejected'].includes(targetStatus)) {
  console.error(`\n[Error] Invalid status "${targetStatus}". Allowed values: approved, pending, rejected.\n`);
  process.exit(1);
}

  try {
    const updated = await db.setDriverStatus(identifier, targetStatus);
    if (!updated) {
      console.error(`\n[Error] Driver "${identifier}" not found in database.\n`);
      process.exit(1);
    }

  console.log(`\n✅ Successfully updated driver status!`);
  console.log(`   Driver ID  : ${updated.driver_id}`);
  console.log(`   Name       : ${updated.name}`);
  console.log(`   Vehicle    : ${updated.vehicle_no}`);
  console.log(`   Device ID  : ${updated.device_id}`);
    console.log(`   New Status : [ ${updated.status.toUpperCase()} ]\n`);
    process.exit(0);
  } catch (err) {
    console.error(`\n[Error] Failed to update driver: ${err.message}\n`);
    process.exit(1);
  }
})();
