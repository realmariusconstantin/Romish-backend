/**
 * Authentication Cookies Module
 * Handles JWT tokens and httpOnly refresh cookies
 * @module auth/cookies
 */

import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';

const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
const REFRESH_TOKEN_EXPIRY = 30 * 24 * 60 * 60; // 30 days in seconds
const REFRESH_COOKIE_NAME = 'romish_rt';

/**
 * Issue access and refresh tokens
 * @param {Object} payload - Token payload (userId, username, email, role, etc)
 * @returns {Object} { accessToken, refreshToken, accessTokenExpiry, refreshTokenExpiry }
 */
export function issueTokens(payload) {
  try {
    if (!payload.userId) {
      throw new Error('userId is required in token payload');
    }

    // Issue access token (15 minutes, kept in memory on FE)
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET || 'dev-secret', {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    // Issue refresh token (30 days, stored in httpOnly cookie)
    const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET || 'refresh-secret', {
      expiresIn: REFRESH_TOKEN_EXPIRY,
    });

    logger.debug(`Tokens issued: { userId: ${payload.userId} }`);

    return {
      accessToken,
      refreshToken,
      accessTokenExpiry: ACCESS_TOKEN_EXPIRY,
      refreshTokenExpiry: REFRESH_TOKEN_EXPIRY,
    };
  } catch (error) {
    logger.error(`Failed to issue tokens: ${error.message}`);
    throw error;
  }
}

/**
 * Set refresh token as httpOnly cookie
 * @param {Object} res - Express response object
 * @param {string} token - Refresh token
 * @param {Object} options - Additional cookie options
 */
export function setRefreshCookie(res, token, options = {}) {
  try {
    const cookieOptions = {
      httpOnly: true, // Prevents JS access
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'lax', // CSRF protection
      maxAge: REFRESH_TOKEN_EXPIRY * 1000, // Convert to milliseconds
      path: '/', // Cookie sent to all endpoints (not just /api/auth)
      ...options,
    };

    res.cookie(REFRESH_COOKIE_NAME, token, cookieOptions);

    logger.debug(`Refresh cookie set with maxAge: ${cookieOptions.maxAge}ms`);
  } catch (error) {
    logger.error(`Failed to set refresh cookie: ${error.message}`);
  }
}

/**
 * Clear refresh token cookie
 * @param {Object} res - Express response object
 */
export function clearRefreshCookie(res) {
  try {
    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/', // Match the path used when setting the cookie
    });

    logger.debug('Refresh cookie cleared');
  } catch (error) {
    logger.error(`Failed to clear refresh cookie: ${error.message}`);
  }
}

/**
 * Verify access token
 * @param {string} token - Access token
 * @returns {Object|null} Decoded payload or null
 */
export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
  } catch (error) {
    logger.debug(`Invalid access token: ${error.message}`);
    return null;
  }
}

/**
 * Verify refresh token
 * @param {string} token - Refresh token
 * @returns {Object|null} Decoded payload or null
 */
export function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET || 'refresh-secret');
  } catch (error) {
    logger.debug(`Invalid refresh token: ${error.message}`);
    return null;
  }
}

/**
 * Refresh tokens (called when access token expires)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object|null} New access token or null if refresh failed
 */
export function refreshAccessToken(req, res) {
  try {
    const refreshToken = req.cookies[REFRESH_COOKIE_NAME];

    if (!refreshToken) {
      logger.warn('No refresh token in cookie');
      return null;
    }

    const payload = verifyRefreshToken(refreshToken);

    if (!payload) {
      logger.warn('Invalid refresh token');
      clearRefreshCookie(res);
      return null;
    }

    // Remove JWT metadata claims before re-issuing
    const cleanPayload = {
      userId: payload.userId,
      steamId: payload.steamId,
      username: payload.username,
      role: payload.role,
    };

    // Issue new tokens
    const { accessToken, refreshToken: newRefreshToken } = issueTokens(cleanPayload);

    // Update refresh cookie with new token and extended expiry
    setRefreshCookie(res, newRefreshToken);

    logger.debug(
      `Tokens refreshed: { userId: ${payload.userId}, newExpiry: +30d }`
    );

    return accessToken;
  } catch (error) {
    logger.error(`Failed to refresh access token: ${error.message}`);
    return null;
  }
}

/**
 * Middleware to rotate refresh token on activity
 * Automatically extends the 30-day window on each authenticated request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export function rotateIfActive(req, res, next) {
  try {
    const refreshToken = req.cookies[REFRESH_COOKIE_NAME];

    if (refreshToken) {
      const payload = verifyRefreshToken(refreshToken);

      if (payload) {
        // Remove JWT metadata claims before re-issuing
        const cleanPayload = {
          userId: payload.userId,
          steamId: payload.steamId,
          username: payload.username,
          role: payload.role,
        };

        // Re-issue refresh token with new expiry (sliding window)
        const { refreshToken: newRefreshToken } = issueTokens(cleanPayload);
        setRefreshCookie(res, newRefreshToken);

        logger.debug(
          `Refresh token rotated (sliding): { userId: ${payload.userId} }`
        );
      } else {
        // Token expired, clear it
        clearRefreshCookie(res);
      }
    }

    next();
  } catch (error) {
    logger.error(`Error in rotateIfActive middleware: ${error.message}`);
    next();
  }
}

/**
 * Middleware to verify access token from Authorization header
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export function verifyAccessTokenMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authorization token' });
    }

    const token = authHeader.substring(7);
    const payload = verifyAccessToken(token);

    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Attach user to request
    req.user = payload;
    next();
  } catch (error) {
    logger.error(`Error verifying access token: ${error.message}`);
    res.status(500).json({ error: 'Token verification failed' });
  }
}

/**
 * Get refresh token cookie name
 * @returns {string} Cookie name
 */
export function getRefreshCookieName() {
  return REFRESH_COOKIE_NAME;
}

/**
 * Get token expiry times
 * @returns {Object} Expiry times
 */
export function getTokenExpiries() {
  return {
    accessTokenExpiry: ACCESS_TOKEN_EXPIRY,
    refreshTokenExpirySeconds: REFRESH_TOKEN_EXPIRY,
    refreshTokenExpiryDays: REFRESH_TOKEN_EXPIRY / (24 * 60 * 60),
  };
}
