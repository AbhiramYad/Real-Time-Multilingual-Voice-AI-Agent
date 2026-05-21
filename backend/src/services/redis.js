const Redis = require('ioredis');

// Active sessions fallback Map (in-memory caching)
const mockCache = new Map();

let redisClient = null;
let isConnected = false;

/**
 * Initialize Redis Connection
 */
function connectRedis() {
  const redisURL = process.env.REDIS_URL;
  if (!redisURL) {
    console.warn('⚠️ REDIS_URL not set. Running with mock in-memory session cache.');
    return false;
  }

  try {
    redisClient = new Redis(redisURL, {
      maxRetriesPerRequest: 3,
      connectTimeout: 5000
    });

    redisClient.on('connect', () => {
      isConnected = true;
      console.log('⚡ Connected to Upstash Redis');
    });

    redisClient.on('error', (err) => {
      console.error('❌ Redis connection error:', err.message);
      isConnected = false;
    });

    return true;
  } catch (error) {
    console.error('❌ Redis initialization failed:', error.message);
    console.warn('⚠️ Falling back to mock in-memory session cache.');
    isConnected = false;
    return false;
  }
}

const redisService = {
  connect: connectRedis,
  isConnected: () => isConnected,

  /**
   * Set session data with expiration (TTL)
   * @param {string} sessionId
   * @param {Object} data
   * @param {number} ttlSeconds - Expiration time (default 1 hour)
   */
  setSession: async (sessionId, data, ttlSeconds = 3600) => {
    const key = `session:${sessionId}`;
    const stringData = JSON.stringify(data);

    if (isConnected && redisClient) {
      try {
        await redisClient.set(key, stringData, 'EX', ttlSeconds);
        return true;
      } catch (err) {
        console.error('❌ Redis setSession error:', err.message);
      }
    }

    // Mock cache fallback
    mockCache.set(sessionId, {
      data,
      expiresAt: Date.now() + (ttlSeconds * 1000)
    });
    return true;
  },

  /**
   * Get session data
   * @param {string} sessionId
   * @returns {Object|null}
   */
  getSession: async (sessionId) => {
    const key = `session:${sessionId}`;

    if (isConnected && redisClient) {
      try {
        const raw = await redisClient.get(key);
        if (raw) {
          return JSON.parse(raw);
        }
      } catch (err) {
        console.error('❌ Redis getSession error:', err.message);
      }
    }

    // Mock cache fallback
    const cached = mockCache.get(sessionId);
    if (cached) {
      if (Date.now() > cached.expiresAt) {
        mockCache.delete(sessionId);
        return null;
      }
      return cached.data;
    }
    return null;
  },

  /**
   * Delete session
   * @param {string} sessionId
   */
  deleteSession: async (sessionId) => {
    const key = `session:${sessionId}`;

    if (isConnected && redisClient) {
      try {
        await redisClient.del(key);
        return true;
      } catch (err) {
        console.error('❌ Redis deleteSession error:', err.message);
      }
    }

    mockCache.delete(sessionId);
    return true;
  },

  /**
   * Cleanup expired mock sessions
   */
  cleanup: () => {
    const now = Date.now();
    for (const [key, val] of mockCache.entries()) {
      if (now > val.expiresAt) {
        mockCache.delete(key);
      }
    }
  }
};

// Periodically clean up mock cache
setInterval(redisService.cleanup, 60000);

module.exports = redisService;
