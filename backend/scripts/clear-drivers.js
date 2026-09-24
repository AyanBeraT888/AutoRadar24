/**
 * Auto 24 - Clear All Registered Drivers Script
 * Safely removes all driver records and resets auto-increment counters.
 * Supports both SQLite and Cloud MySQL.
 */

require('dotenv').config({ path: require('node:path').join(__dirname, '../.env') });
const path = require('node:path');
const fs = require('node:fs');

async function clearDrivers() {
  const useMySQL =
    process.env.DB_TYPE === 'mysql' ||
    Boolean(process.env.MYSQL_HOST) ||
    Boolean(process.env.DATABASE_URL);

  if (useMySQL) {
    const mysql = require('mysql2/promise');
    const config = process.env.DATABASE_URL
      ? { uri: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true } }
      : {
          host: process.env.MYSQL_HOST || 'localhost',
          port: parseInt(process.env.MYSQL_PORT || '3306', 10),
          user: process.env.MYSQL_USER || 'root',
          password: process.env.MYSQL_PASSWORD || '',
          database: process.env.MYSQL_DATABASE || 'auto24',
        };

    const connection = await mysql.createConnection(config);
    const [result] = await connection.query('DELETE FROM drivers');
    try {
      await connection.query('ALTER TABLE drivers AUTO_INCREMENT = 1');
    } catch {}
    await connection.end();
    console.log(`[Auto 24] Deleted all drivers from MySQL (${result.affectedRows} records removed).`);
  } else {
    const { DatabaseSync } = require('node:sqlite');
    let dbPath = process.env.DB_PATH;
    if (!dbPath) {
      const p1 = path.join(__dirname, '../data/auto24.db');
      const p2 = path.join(__dirname, '../../data/auto24.db');
      dbPath = fs.existsSync(p1) ? p1 : p2;
    }

    if (!fs.existsSync(dbPath)) {
      console.log(`[Auto 24] SQLite database not found at ${dbPath}. Nothing to delete.`);
      return;
    }

    const sqliteDb = new DatabaseSync(dbPath);
    const countBefore = sqliteDb.prepare('SELECT COUNT(*) as count FROM drivers').get();
    sqliteDb.exec('DELETE FROM drivers;');
    try {
      sqliteDb.exec("DELETE FROM sqlite_sequence WHERE name = 'drivers';");
    } catch {}
    console.log(`[Auto 24] Successfully deleted all registered drivers from SQLite (${countBefore?.count || 0} removed).`);
  }
}

clearDrivers()
  .then(() => {
    console.log('[Auto 24] Database is clean. Ready for new auto-approved driver logins!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[Auto 24] Error clearing drivers:', err);
    process.exit(1);
  });
