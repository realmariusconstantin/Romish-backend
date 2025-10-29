import express from 'express';
import passport from '../config/passport.js';
import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import User from '../models/user.model.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { upload } from '../config/multer.config.js';
import {
  getCurrentUser,
  logout,
  updateProfile,
  uploadAvatar,
} from '../controllers/auth.controller.js';

const router = express.Router();

/**
 * @route   GET /api/auth/steam
 * @desc    Initiate Steam login - redirects to Steam OpenID
 * @access  Public
 */
router.get('/steam', (req, res, next) => {
  passport.authenticate('steam')(req, res, next);
});

/**
 * @route   GET /api/auth/steam/return
 * @desc    Steam OpenID callback - verify and create/update user
 * @access  Public
 */
router.get('/steam/return',
  passport.authenticate('steam', { 
    failureRedirect: `${config.frontendUrl}/login?error=steam_auth_failed`,
    session: false 
  }),
  async (req, res) => {
    try {
      const steamId = req.user.id;
      const profile = req.user._json;

      console.log('Steam Profile Data:', {
        steamId,
        personaname: profile.personaname,
        avatarfull: profile.avatarfull,
        profileurl: profile.profileurl
      });

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
      } else {
        // Update existing user info from Steam
        user.name = profile.personaname;
        user.avatar = profile.avatarfull;
        user.profileUrl = profile.profileurl;
        user.lastLogin = new Date();
        
        await user.save();
      }

      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: user._id, 
          steamId: user.steamId,
          username: user.name 
        },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn }
      );

      // Set HTTP-only cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: 'lax',
        maxAge: 14 * 24 * 60 * 60 * 1000 // 14 days (2 weeks)
      });

      // Redirect to frontend
      res.redirect(`${config.frontendUrl}/?login=success`);
      
    } catch (error) {
      console.error('Steam auth error:', error);
      res.redirect(`${config.frontendUrl}/login?error=server_error`);
    }
  }
);

/**
 * @route   GET /api/auth/user
 * @desc    Get current authenticated user
 * @access  Private
 */
router.get('/user', authenticate, getCurrentUser);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout - clear JWT cookie
 * @access  Private
 */
router.post('/logout', authenticate, logout);

/**
 * @route   PUT /api/auth/update-profile
 * @desc    Update user profile (name, avatar)
 * @access  Private
 */
router.put('/update-profile', authenticate, updateProfile);

/**
 * @route   POST /api/auth/upload-avatar
 * @desc    Upload avatar image
 * @access  Private
 */
router.post('/upload-avatar', authenticate, upload.single('avatar'), uploadAvatar);

export default router;
