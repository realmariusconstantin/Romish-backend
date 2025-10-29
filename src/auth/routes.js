/**
 * Authentication Routes
 * Handles login, refresh, logout, token management, and Steam OAuth
 * @module auth/routes
 */

import express from 'express';
import logger from '../utils/logger.js';
import * as cookiesService from './cookies.js';
import passport from '../config/passport.js';
import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import User from '../models/user.model.js';

const router = express.Router();

/**
 * GET /api/auth/test
 * Test endpoint to verify auth routes are working
 */
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Auth routes are working!' });
});

/**
 * POST /api/auth/login
 * Test login endpoint (for development without Steam)
 * Expected body: { username, steamId }
 */
router.post('/login', async (req, res) => {
  try {
    const { username, steamId } = req.body;

    if (!username || !steamId) {
      return res.status(400).json({
        error: 'username and steamId required for test login',
      });
    }

    logger.info(`Test login: { username: ${username}, steamId: ${steamId} }`);

    // Check if user exists in database
    let user = await User.findOne({ steamId });
    
    if (!user) {
      // Create new user
      user = await User.create({
        steamId,
        name: username,
        avatar: `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/default_avatar.jpg`,
        profileUrl: `https://steamcommunity.com/profiles/${steamId}`,
      });
      logger.info(`New test user created: steamId=${steamId}, userId=${user._id}`);
    }

    // Issue tokens
    const { accessToken, refreshToken } = cookiesService.issueTokens({
      userId: user._id.toString(),
      steamId: user.steamId,
      username: user.name,
      role: 'user',
    });

    // Set refresh token as httpOnly cookie
    cookiesService.setRefreshCookie(res, refreshToken);

    logger.success(`Test user logged in: steamId=${steamId}, userId=${user._id}`);

    return res.status(200).json({
      success: true,
      accessToken,
      user: {
        userId: user._id.toString(),
        steamId: user.steamId,
        username: user.name,
        role: 'user',
      },
    });
  } catch (error) {
    logger.error(`Test login error: ${error.message}`, { error: error.stack });
    return res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/login-steam
 * Authenticate user and issue tokens (old endpoint, deprecated)
 * Expected body: { email, password } or { username, password }
 */
/*  REMOVED - Use POST /api/auth/login instead
router.post('/login-deprecated', async (req, res) => {
  // ... old code removed
})
*/

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token from cookie
 */
router.post('/refresh', (req, res) => {
  try {
    const newAccessToken = cookiesService.refreshAccessToken(req, res);

    if (!newAccessToken) {
      cookiesService.clearRefreshCookie(res);
      return res.status(401).json({ error: 'Refresh token invalid or expired' });
    }

    logger.info('Access token refreshed');

    return res.status(200).json({
      success: true,
      accessToken: newAccessToken,
    });
  } catch (error) {
    logger.error(`Refresh error: ${error.message}`, { error: error.stack });
    return res.status(500).json({ error: 'Token refresh failed' });
  }
});

/**
 * POST /api/auth/logout
 * Clear refresh token cookie
 */
router.post('/logout', (req, res) => {
  try {
    const userId = req.user?.userId || 'unknown';
    cookiesService.clearRefreshCookie(res);

    logger.info(`User logged out: { userId: ${userId} }`);

    return res.status(200).json({
      success: true,
      message: 'Logged out',
    });
  } catch (error) {
    logger.error(`Logout error: ${error.message}`, { error: error.stack });
    return res.status(500).json({ error: 'Logout failed' });
  }
});

/**
 * GET /api/auth/verify
 * Verify current auth state
 * Used by FE on app load to refresh cookie window
 */
router.get('/verify', cookiesService.verifyAccessTokenMiddleware, (req, res) => {
  try {
    const user = req.user;

    logger.debug(`Auth verified: { userId: ${user.userId} }`);

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    logger.error(`Verify error: ${error.message}`);
    return res.status(401).json({ error: 'Verification failed' });
  }
});

/**
 * GET /api/auth/me
 * Get current authenticated user's full profile
 * Returns complete user data from database
 */
router.get('/me', cookiesService.verifyAccessTokenMiddleware, async (req, res) => {
  try {
    const { userId } = req.user;
    
    console.log('GET /api/auth/me - userId from token:', userId);

    // Fetch full user object from database
    const user = await User.findById(userId).lean();

    if (!user) {
      console.warn(`User not found in DB: userId=${userId}`);
      logger.warn(`User not found: userId=${userId}`);
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    console.log(`User found: steamId=${user.steamId}, username=${user.name}`);
    logger.debug(`User profile retrieved: userId=${userId}`);

    return res.status(200).json({
      success: true,
      user: {
        userId: user._id.toString(),
        steamId: user.steamId,
        username: user.name,
        avatar: user.avatar,
        profileUrl: user.profileUrl,
        trustScore: user.trustScore || 0,
        isCaptainEligible: user.isCaptainEligible || false,
        isAdmin: user.isAdmin || false,
        isBanned: user.isBanned || false,
        stats: user.stats || {},
        winRate: user.winRate || 0,
        currentMatch: user.currentMatch || null,
        role: 'user',
      },
    });
  } catch (error) {
    console.error('GET /api/auth/me error:', error);
    logger.error(`Get user profile error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve user profile',
    });
  }
});

/**
 * GET /api/auth/token-info
 * Get token expiry information (for debugging)
 */
router.get('/token-info', (req, res) => {
  try {
    const expiries = cookiesService.getTokenExpiries();

    return res.status(200).json({
      success: true,
      tokenInfo: expiries,
    });
  } catch (error) {
    logger.error(`Token info error: ${error.message}`);
    return res.status(500).json({ error: 'Failed to get token info' });
  }
});

/**
 * GET /api/auth/steam
 * Initiate Steam login - redirects to Steam OpenID
 * @access  Public
 */
router.get('/steam', (req, res, next) => {
  console.log('Steam login initiated - calling passport.authenticate("steam")');
  logger.info('Steam OAuth flow initiated');
  passport.authenticate('steam')(req, res, next);
});

/**
 * GET /api/auth/steam/return
 * Steam OpenID callback - verify and create/update user
 * Creates user and issues JWT token
 * @access  Public
 */
router.get('/steam/return',
  passport.authenticate('steam', { 
    failureRedirect: `${config.frontendUrl}/login?error=steam_auth_failed`,
    session: false 
  }),
  async (req, res) => {
    try {
      console.log('Steam return callback received');
      console.log('req.user:', req.user);
      
      if (!req.user) {
        logger.error('Steam return: req.user is null or undefined');
        return res.redirect(`${config.frontendUrl}/login?error=steam_auth_failed`);
      }
      
      const steamId = req.user.id;
      const profile = req.user._json;

      console.log('Steam profile received:', { steamId, personaname: profile?.personaname });
      logger.info(`Steam login attempt: steamId=${steamId}, username=${profile?.personaname}`);

      // Find or create user
      let user = await User.findOne({ steamId });
      
      if (!user) {
        // Create new user
        user = await User.create({
          steamId,
          name: profile.personaname,
          avatar: profile.avatarfull,
          profileUrl: profile.profileurl,
        });
        logger.info(`New user created: steamId=${steamId}, userId=${user._id}`);
        console.log('User created:', { steamId, userId: user._id });
      } else {
        // Update existing user info from Steam
        user.name = profile.personaname;
        user.avatar = profile.avatarfull;
        user.profileUrl = profile.profileurl;
        user.lastLogin = new Date();
        
        await user.save();
        logger.info(`User updated: steamId=${steamId}, userId=${user._id}`);
        console.log('User updated:', { steamId, userId: user._id });
      }

      // Issue tokens using the new JWT system
      const { accessToken, refreshToken } = cookiesService.issueTokens({
        userId: user._id.toString(),
        steamId: user.steamId,
        username: user.name,
        role: 'user',
      });

      // Set refresh token as httpOnly cookie
      cookiesService.setRefreshCookie(res, refreshToken);

      logger.success(`Steam user authenticated: steamId=${steamId}, userId=${user._id}`);
      console.log('Tokens issued, redirecting to:', `${config.frontendUrl}/login?login=success&token=${accessToken}`);

      // Redirect to frontend LOGIN page with access token in query
      // LoginView will extract token and authenticate user
      res.redirect(`${config.frontendUrl}/login?login=success&token=${accessToken}`);
      
    } catch (error) {
      console.error('Steam auth error caught:', error);
      logger.error(`Steam auth error: ${error.message}`, { error: error.stack });
      res.redirect(`${config.frontendUrl}/login?error=server_error`);
    }
  }
);

export default router;
