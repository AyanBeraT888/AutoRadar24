/**
 * Auto 24 - Dual-Engine Database Manager
 * Supports 100% Free 24/7 Cloud MySQL and Native Embedded SQLite.
 *
 * Automatically activates MySQL when DB_TYPE=mysql, MYSQL_HOST, or DATABASE_URL is configured.
 * Otherwise gracefully runs local zero-configuration SQLite for offline development and testing.
 */

const path = require('node:path');
const fs = require('node:fs');

let useMySQL =
  process.env.DB_TYPE === 'mysql' ||
  Boolean(process.env.MYSQL_HOST) ||
  Boolean(process.env.DATABASE_URL);

let pool = null;
let sqliteDb = null;

// ==========================================
// 1. DATABASE ENGINE INITIALIZATION
// ==========================================

function initSQLite() {
  if (sqliteDb) return;
  const { DatabaseSync } = require('node:sqlite');
  const os = require('node:os');

  let DATA_DIR = process.env.DATA_DIR;
  if (!DATA_DIR) {
    const candidate1 = path.join(__dirname, '../data');
    const candidate2 = path.join(__dirname, '../../data');
    if (fs.existsSync(candidate1)) {
      DATA_DIR = candidate1;
    } else if (fs.existsSync(candidate2)) {
      DATA_DIR = candidate2;
    } else {
      try {
        fs.mkdirSync(candidate1, { recursive: true });
        DATA_DIR = candidate1;
      } catch {
        DATA_DIR = path.join(os.tmpdir(), 'auto24_data');
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
    }
  } else if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch {
      DATA_DIR = path.join(os.tmpdir(), 'auto24_data');
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'auto24.db');
  sqliteDb = new DatabaseSync(DB_PATH);
  sqliteDb.exec('PRAGMA journal_mode = WAL;');

  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS drivers (
      driver_id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      vehicle_no TEXT NOT NULL,
      device_id TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'approved' CHECK(status IN ('pending', 'approved', 'rejected')),
      lat REAL,
      lng REAL,
      moving_status TEXT DEFAULT 'idle' CHECK(moving_status IN ('moving', 'idle')),
      last_updated INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_drivers_device_id ON drivers(device_id);
    CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);
  `);
  console.log(`[Auto 24 Database] Activated Embedded SQLite on ${DB_PATH}`);
}

if (useMySQL) {
  const mysql = require('mysql2/promise');

  const config = process.env.DATABASE_URL
    ? {
        uri: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: true },
        waitForConnections: true,
        connectionLimit: 15,
        queueLimit: 0,
        connectTimeout: 5000,
      }
    : {
        host: process.env.MYSQL_HOST || 'localhost',
        port: parseInt(process.env.MYSQL_PORT || '3306', 10),
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'auto24',
        waitForConnections: true,
        connectionLimit: 15,
        queueLimit: 0,
        connectTimeout: 5000,
        ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
      };

  pool = mysql.createPool(config);

  // Initialize MySQL Schema with automatic SQLite fallback if unreachable
  (async () => {
    try {
      const conn = await pool.getConnection();
      await conn.query(`
        CREATE TABLE IF NOT EXISTS drivers (
          driver_id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          phone VARCHAR(50) NOT NULL,
          vehicle_no VARCHAR(50) NOT NULL,
          device_id VARCHAR(100) UNIQUE NOT NULL,
          status VARCHAR(20) DEFAULT 'approved',
          lat DOUBLE NULL,
          lng DOUBLE NULL,
          moving_status VARCHAR(20) DEFAULT 'idle',
          last_updated BIGINT NULL,
          created_at BIGINT NOT NULL,
          INDEX idx_drivers_device_id (device_id),
          INDEX idx_drivers_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      conn.release();
      console.log(`[Auto 24 Database] Connected to 24/7 Cloud MySQL on ${config.host || 'remote'}`);
    } catch (err) {
      console.error('[Auto 24 Database] MySQL failed to connect:', err.message);
      console.log('[Auto 24 Database] Gracefully switching to Embedded SQLite fallback...');
      useMySQL = false;
      pool = null;
      initSQLite();
    }
  })();
} else {
  initSQLite();
}

// ==========================================
// UNIFIED ASYNC DATABASE ACCESS API
// ==========================================

/**
 * Register a new driver or update existing record with auto-approval.
 */
async function registerDriver({ name, phone, vehicle_no, device_id }) {
  const existing = await getDriverByDeviceId(device_id);
  if (existing) {
    if (useMySQL) {
      await pool.query(
        "UPDATE drivers SET name = ?, phone = ?, vehicle_no = ?, status = 'approved' WHERE device_id = ?",
        [name, phone, vehicle_no, device_id]
      );
    } else {
      const updateStmt = sqliteDb.prepare(
        "UPDATE drivers SET name = ?, phone = ?, vehicle_no = ?, status = 'approved' WHERE device_id = ?"
      );
      updateStmt.run(name, phone, vehicle_no, device_id);
    }
    return getDriverByDeviceId(device_id);
  }

  const now = Date.now();
  if (useMySQL) {
    const [result] = await pool.query(
      "INSERT INTO drivers (name, phone, vehicle_no, device_id, status, moving_status, created_at) VALUES (?, ?, ?, ?, 'approved', 'idle', ?)",
      [name, phone, vehicle_no, device_id, now]
    );
    return getDriverById(result.insertId);
  } else {
    const insertStmt = sqliteDb.prepare(
      "INSERT INTO drivers (name, phone, vehicle_no, device_id, status, moving_status, created_at) VALUES (?, ?, ?, ?, 'approved', 'idle', ?)"
    );
    const result = insertStmt.run(name, phone, vehicle_no, device_id, now);
    return getDriverById(result.lastInsertRowid);
  }
}

/**
 * Retrieve driver record by unique device_id
 */
async function getDriverByDeviceId(deviceId) {
  if (useMySQL) {
    const [rows] = await pool.query('SELECT * FROM drivers WHERE device_id = ?', [deviceId]);
    return rows[0] || null;
  } else {
    const stmt = sqliteDb.prepare('SELECT * FROM drivers WHERE device_id = ?');
    return stmt.get(deviceId) || null;
  }
}

/**
 * Retrieve driver record by numeric driver_id
 */
async function getDriverById(driverId) {
  if (useMySQL) {
    const [rows] = await pool.query('SELECT * FROM drivers WHERE driver_id = ?', [driverId]);
    return rows[0] || null;
  } else {
    const stmt = sqliteDb.prepare('SELECT * FROM drivers WHERE driver_id = ?');
    return stmt.get(driverId) || null;
  }
}

/**
 * Retrieve all drivers (optionally filtered by status)
 */
async function getAllDrivers(statusFilter = null) {
  if (useMySQL) {
    if (statusFilter) {
      const [rows] = await pool.query(
        'SELECT * FROM drivers WHERE status = ? ORDER BY driver_id ASC',
        [statusFilter]
      );
      return rows;
    }
    const [rows] = await pool.query('SELECT * FROM drivers ORDER BY driver_id ASC');
    return rows;
  } else {
    if (statusFilter) {
      const stmt = sqliteDb.prepare('SELECT * FROM drivers WHERE status = ? ORDER BY driver_id ASC');
      return stmt.all(statusFilter);
    }
    const stmt = sqliteDb.prepare('SELECT * FROM drivers ORDER BY driver_id ASC');
    return stmt.all();
  }
}

/**
 * Update a driver's live GPS coordinates, moving status, and timestamp.
 */
async function updateLocation(deviceId, lat, lng, moving_status, timestamp) {
  const ts = timestamp || Date.now();
  if (useMySQL) {
    const [result] = await pool.query(
      'UPDATE drivers SET lat = ?, lng = ?, moving_status = ?, last_updated = ? WHERE device_id = ?',
      [lat, lng, moving_status, ts, deviceId]
    );
    return result.affectedRows > 0;
  } else {
    const stmt = sqliteDb.prepare(
      'UPDATE drivers SET lat = ?, lng = ?, moving_status = ?, last_updated = ? WHERE device_id = ?'
    );
    const result = stmt.run(lat, lng, moving_status, ts, deviceId);
    return result.changes > 0;
  }
}

/**
 * Set driver approval status ('pending' | 'approved' | 'rejected').
 */
async function setDriverStatus(identifier, status) {
  const validStatuses = ['pending', 'approved', 'rejected'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
  }

  const isNumeric = typeof identifier === 'number' || /^\d+$/.test(identifier);

  if (useMySQL) {
    if (isNumeric) {
      await pool.query('UPDATE drivers SET status = ? WHERE driver_id = ?', [status, Number(identifier)]);
      return getDriverById(Number(identifier));
    } else {
      await pool.query('UPDATE drivers SET status = ? WHERE device_id = ?', [status, identifier]);
      return getDriverByDeviceId(identifier);
    }
  } else {
    if (isNumeric) {
      const stmt = sqliteDb.prepare('UPDATE drivers SET status = ? WHERE driver_id = ?');
      stmt.run(status, Number(identifier));
      return getDriverById(Number(identifier));
    } else {
      const stmt = sqliteDb.prepare('UPDATE drivers SET status = ? WHERE device_id = ?');
      stmt.run(status, identifier);
      return getDriverByDeviceId(identifier);
    }
  }
}

module.exports = {
  isMySQL: useMySQL,
  registerDriver,
  getDriverByDeviceId,
  getDriverById,
  getAllDrivers,
  updateLocation,
  setDriverStatus,
};
