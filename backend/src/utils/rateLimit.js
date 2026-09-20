/**
 * Auto 24 - In-Memory Sliding Window Rate Limiter
 * Zero external dependencies, fast and resilient DDoS/spam defense.
 */

function createRateLimiter({ windowMs = 60 * 1000, max = 100, message = 'Too many requests, please try again later.', keyGenerator = null }) {
  // Map<key, Array<timestamp>>
  const hits = new Map();

  // Periodically sweep expired timestamps every 60s
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of hits.entries()) {
      const valid = timestamps.filter((t) => now - t < windowMs);
      if (valid.length === 0) {
        hits.delete(key);
      } else {
        hits.set(key, valid);
      }
    }
  }, 60 * 1000);

  if (cleanupTimer.unref) {
    cleanupTimer.unref(); // Don't hold Node process open
  }

  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    let key = '';

    if (typeof keyGenerator === 'function') {
      key = keyGenerator(req);
    } else {
      // Default key: client IP address
      key = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-client';
    }

    const timestamps = hits.get(key) || [];
    // Filter timestamps within current window
    const recent = timestamps.filter((t) => now - t < windowMs);

    if (recent.length >= max) {
      const oldest = recent[0];
      const retryAfterSeconds = Math.ceil((windowMs - (now - oldest)) / 1000);

      res.setHeader('Retry-After', retryAfterSeconds);
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', Math.ceil((oldest + windowMs) / 1000));

      return res.status(429).json({
        error: message,
        retryAfterSeconds,
      });
    }

    recent.push(now);
    hits.set(key, recent);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - recent.length));

    next();
  };
}

module.exports = { createRateLimiter };
