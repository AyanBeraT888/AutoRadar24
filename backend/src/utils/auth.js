/**
 * Auto 24 - Driver Authentication & Cryptographic Token Service
 * Lightweight, zero-dependency token signing using Node.js native crypto (HMAC-SHA256).
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const WEAK_SECRETS = new Set([
  'secret',
  'changeme',
  'password',
  '12345678',
  'jwt_secret',
  'change_this_to_a_random_64_character_hex_secret',
  'default_secret',
]);

// Resolve or persist JWT_SECRET
function resolveSecret() {
  const envSecret = process.env.JWT_SECRET ? process.env.JWT_SECRET.trim() : '';
  if (envSecret && envSecret.length >= 16 && !WEAK_SECRETS.has(envSecret.toLowerCase())) {
    return envSecret;
  }

  if (envSecret && (envSecret.length < 16 || WEAK_SECRETS.has(envSecret.toLowerCase()))) {
    console.warn('[Auto 24 Security] WARNING: Weak or placeholder JWT_SECRET detected in environment! Falling back to cryptographically random secret.');
  }

  const secretFile = path.join(__dirname, '../../data/.jwt_secret');
  try {
    if (fs.existsSync(secretFile)) {
      const secret = fs.readFileSync(secretFile, 'utf8').trim();
      if (secret.length >= 32 && !WEAK_SECRETS.has(secret.toLowerCase())) return secret;
    }
  } catch (err) {}

  // Generate a cryptographically secure 64-byte random hex secret and save
  const newSecret = crypto.randomBytes(32).toString('hex');
  try {
    const dataDir = path.join(__dirname, '../../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(secretFile, newSecret, { mode: 0o600 });
  } catch (err) {}
  return newSecret;
}

const JWT_SECRET = resolveSecret();
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days valid for approved drivers

/**
 * Base64 URL-safe encoding helper
 */
function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Base64 URL-safe decoding helper
 */
function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Generate a signed driver authentication token
 */
function generateDriverToken(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Date.now() + TOKEN_TTL_MS;
  const fullPayload = {
    ...payload,
    exp,
    iat: Date.now(),
    iss: 'auto24-backend',
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(dataToSign)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${dataToSign}.${signature}`;
}

/**
 * Verify and decode driver authentication token
 */
function verifyDriverToken(token) {
  if (!token || typeof token !== 'string') return null;

  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const expectedSignature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(dataToSign)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  // Constant-time comparison to prevent timing attacks
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.exp && Date.now() > payload.exp) {
      return null; // Expired
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Express Middleware: Require valid driver authorization token
 * Extracts token from `Authorization: Bearer <token>` or `req.body.auth_token`.
 * Validates that token device_id matches the request body device_id.
 */
function requireDriverAuth(req, res, next) {
  let token = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.body && req.body.auth_token) {
    token = String(req.body.auth_token).trim();
  }

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized: Missing driver authentication token.',
      code: 'AUTH_TOKEN_REQUIRED',
    });
  }

  const decoded = verifyDriverToken(token);
  if (!decoded) {
    return res.status(401).json({
      error: 'Unauthorized: Invalid or expired driver authentication token.',
      code: 'AUTH_TOKEN_INVALID',
    });
  }

  // Cross-check: If body specifies device_id, ensure it matches the token
  const bodyDeviceId = req.body && req.body.device_id;
  if (bodyDeviceId && decoded.device_id && bodyDeviceId !== decoded.device_id) {
    return res.status(403).json({
      error: 'Forbidden: Token does not match the specified device ID.',
      code: 'DEVICE_MISMATCH',
    });
  }

  req.driverAuth = decoded;
  next();
}

module.exports = {
  generateDriverToken,
  verifyDriverToken,
  requireDriverAuth,
};
