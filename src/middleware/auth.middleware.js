import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import User from '../models/user.model.js';
import { refreshAccessToken } from '../auth/cookies.js';

/**
 * Verify JWT token and attach user to request
 */
export const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header OR cookie (fallback)
    let token = null;
    
    // Check Authorization header first (Bearer token)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7); // Remove 'Bearer ' prefix
    }
    
    // Fallback to cookie if no Authorization header
    if (!token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // Verify token
    const decoded = jwt.verify(token, config.jwtSecret);

    // Get user from database
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found',
      });
    }

    // Check if user is banned
    if (user.isBanned) {
      // Check if ban has expired
      if (user.bannedUntil && new Date() > user.bannedUntil) {
        user.isBanned = false;
        user.banReason = null;
        user.bannedBy = null;
        user.bannedAt = null;
        user.bannedUntil = null;
        await user.save();
      } else {
        return res.status(403).json({ 
          success: false, 
          error: 'Account is banned',
          banReason: user.banReason,
          bannedUntil: user.bannedUntil
        });
      }
    }

    // Attach user to request
    req.user = user;
    req.userId = user._id;
    req.steamId = user.steamId;

    next();
  } catch (error) {
    console.error('Authentication error:', error.message);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      // Try to refresh the token automatically
      const newAccessToken = refreshAccessToken(req, res);

      if (newAccessToken) {
        // Re-verify with the new token
        const decoded = jwt.verify(newAccessToken, config.jwtSecret);

        // Get user from database
        const user = await User.findById(decoded.userId);

        if (!user) {
          return res.status(401).json({
            success: false,
            error: 'User not found',
          });
        }

        // Check if user is banned
        if (user.isBanned) {
          // Check if ban has expired
          if (user.bannedUntil && new Date() > user.bannedUntil) {
            user.isBanned = false;
            user.banReason = null;
            user.bannedBy = null;
            user.bannedAt = null;
            user.bannedUntil = null;
            await user.save();
          } else {
            return res.status(403).json({
              success: false,
              error: 'Account is banned',
              banReason: user.banReason,
              bannedUntil: user.bannedUntil
            });
          }
        }

        // Attach user to request
        req.user = user;
        req.userId = user._id;
        req.steamId = user.steamId;

        // Continue to next middleware
        return next();
      }

      return res.status(401).json({
        success: false,
        error: 'Token expired and refresh failed',
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Authentication failed',
    });
  }
};

/**
 * Optional authentication - doesn't fail if no token
 */
export const authenticateOptional = async (req, res, next) => {
  try {
    const token = req.cookies.token;

    if (token) {
      const decoded = jwt.verify(token, config.jwtSecret);
      const user = await User.findById(decoded.userId);
      
      if (user) {
        req.user = user;
        req.userId = user._id;
        req.steamId = user.steamId;
      }
    }

    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

/**
 * Check if user is admin
 */
export const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Admin access required',
    });
  }

  next();
};

/**
 * Check if user can join queue (not already in queue or match)
 */
export const canJoinQueue = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
  }

  if (req.user.inQueue) {
    return res.status(400).json({
      success: false,
      error: 'Already in queue',
    });
  }

  // Check if user has a currentMatch reference
  if (req.user.currentMatch) {
    // Import Match model to verify if match is still active
    const Match = (await import('../models/match.model.js')).default;
    const match = await Match.findById(req.user.currentMatch);
    
    // If match doesn't exist or is completed/cancelled, clear the reference
    if (!match || match.phase === 'completed' || match.phase === 'cancelled') {
      req.user.currentMatch = null;
      req.user.inQueue = false;
      await req.user.save();
    } else {
      // Match is still active
      return res.status(400).json({
        success: false,
        error: 'Already in an active match',
      });
    }
  }

  if (req.user.trustScore < 50) {
    return res.status(403).json({
      success: false,
      error: 'Trust score too low to join queue',
    });
  }

  next();
};

export default {
  authenticate,
  authenticateOptional,
  requireAdmin,
  canJoinQueue,
};
