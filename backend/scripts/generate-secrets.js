/**
 * Auto 24 - Production Security Secrets Generator
 *
 * Generates cryptographically secure, high-entropy secrets for:
 * - JWT_SECRET (HMAC-SHA256 driver token signing)
 * - MYSQL_ROOT_PASSWORD & MYSQL_PASSWORD (MySQL 8.0 Cloud Database)
 *
 * Usage:
 *   node backend/scripts/generate-secrets.js
 *   node backend/scripts/generate-secrets.js --write-env
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function generateSecureString(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function generatePassword(length = 24) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=';
  const randomBytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[randomBytes[i] % chars.length];
  }
  return result;
}

const jwtSecret = generateSecureString(32); // 64 hex chars
const mysqlRootPassword = generateSecureString(16); // 32 hex chars
const mysqlUserPassword = generateSecureString(16); // 32 hex chars

console.log('\n======================================================');
console.log('  AUTO 24 PRODUCTION SECRETS (CRYPTOGRAPHICALLY RANDOM)');
console.log('======================================================\n');
console.log('# Generated on:', new Date().toISOString());
console.log(`JWT_SECRET=${jwtSecret}`);
console.log(`MYSQL_ROOT_PASSWORD=${mysqlRootPassword}`);
console.log(`MYSQL_PASSWORD=${mysqlUserPassword}`);
console.log('\n======================================================\n');

const shouldWrite = process.argv.includes('--write-env');
if (shouldWrite) {
  const rootEnvPath = path.join(__dirname, '../../.env');
  const backendEnvPath = path.join(__dirname, '../.env');

  const envTemplate = `# Auto 24 Production Environment Configuration
# Generated on: ${new Date().toISOString()}

PORT=3000
NODE_ENV=production

# Database Configuration (mysql for Docker/Cloud, sqlite for local offline dev)
DB_TYPE=mysql
MYSQL_HOST=mysql
MYSQL_PORT=3306
MYSQL_DATABASE=auto24
MYSQL_USER=auto24_user
MYSQL_PASSWORD=${mysqlUserPassword}
MYSQL_ROOT_PASSWORD=${mysqlRootPassword}

# Cryptographically Secure JWT Secret for Driver Authentication
JWT_SECRET=${jwtSecret}

# Driver Idle & Movement Thresholds
IDLE_TIMEOUT_SECONDS=15
MOVEMENT_THRESHOLD_METERS=7
SPEED_THRESHOLD_KMH=5

# Automated HTTPS (Caddy / Let's Encrypt)
DOMAIN=:80
ACME_EMAIL=admin@auto24.local
`;

  if (!fs.existsSync(rootEnvPath)) {
    fs.writeFileSync(rootEnvPath, envTemplate);
    console.log(`[+] Created root .env at: ${rootEnvPath}`);
  } else {
    console.log(`[!] Root .env already exists. Did not overwrite. Copy values above.`);
  }

  // Also update or append to backend/.env
  let backendEnv = fs.existsSync(backendEnvPath) ? fs.readFileSync(backendEnvPath, 'utf8') : '';
  if (!backendEnv.includes('JWT_SECRET=')) {
    backendEnv += `\n# Secure JWT Secret\nJWT_SECRET=${jwtSecret}\n`;
    fs.writeFileSync(backendEnvPath, backendEnv);
    console.log(`[+] Added JWT_SECRET to: ${backendEnvPath}`);
  }
} else {
  console.log('Tip: Run with --write-env to automatically generate a fresh .env file:');
  console.log('  node backend/scripts/generate-secrets.js --write-env\n');
}
