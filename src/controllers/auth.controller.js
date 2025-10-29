import jwt from 'jsonwebtoken';
import openid from 'openid';
import config from '../config/env.js';
import steamConfig from '../config/steam.config.js';
import User from '../models/user.model.js';
import { getPlayerSummary, extractSteamId } from '../utils/steamApi.js';
import { deleteOldAvatar } from '../config/multer.config.js';

// Initialize OpenID RelyingParty
const relyingParty = new openid.RelyingParty(
  steamConfig.openid.returnURL,
  steamConfig.openid.realm,
  true, // Use stateless verification
  false, // Don't use association
  []
);

/**
 * Initiate Steam login - redirect to Steam OpenID
 */
export const steamLogin = async (req, res) => {
  try {
    relyingParty.authenticate(
      steamConfig.openid.providerIdentifier,
      false,
      (error, authUrl) => {
        if (error) {
          console.error('Steam OpenID authentication error:', error.message);
          return res.status(500).json({
            success: false,
            error: 'Failed to initiate Steam login',
          });
        }

        if (!authUrl) {
          return res.status(500).json({
            success: false,
            error: 'Failed to generate Steam authentication URL',
          });
        }

        // Redirect to Steam login page
        res.redirect(authUrl);
      }
    );
  } catch (error) {
    console.error('Steam login error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate Steam login',
    });
  }
};

/**
 * Steam login callback - verify OpenID response and create/update user
 */
export const steamCallback = async (req, res) => {
  try {
    // Verify OpenID response
    relyingParty.verifyAssertion(req.url, async (error, result) => {
      if (error || !result || !result.authenticated) {
        console.error('Steam verification error:', error?.message || 'Not authenticated');
        return res.redirect(`${config.frontendUrl}/login?error=steam_auth_failed`);
      }

      try {
        // Extract Steam ID from claimed identifier
        const steamId = extractSteamId(result.claimedIdentifier);

        if (!steamId) {
          return res.redirect(`${config.frontendUrl}/login?error=invalid_steam_id`);
        }

        // Fetch player data from Steam API
        const playerData = await getPlayerSummary(steamId);

        if (!playerData) {
          return res.redirect(`${config.frontendUrl}/login?error=steam_api_failed`);
        }

        // Find or create user
        let user = await User.findOne({ steamId });

        if (user) {
          // Update existing user
          user.name = playerData.personaname;
          user.avatar = playerData.avatarfull;
          user.profileUrl = playerData.profileurl;
          user.lastLogin = new Date();
          await user.save();
        } else {
          // Create new user
          user = await User.create({
            steamId,
            name: playerData.personaname,
            avatar: playerData.avatarfull,
            profileUrl: playerData.profileurl,
            trustScore: 100, // Default trust score
            lastLogin: new Date(),
          });
        }

        // Generate JWT token
        const token = jwt.sign(
          {
            userId: user._id,
            steamId: user.steamId,
          },
          config.jwtSecret,
          {
            expiresIn: '7d',
          }
        );

        // Set HTTP-only cookie
        res.cookie('token', token, {
          httpOnly: true,
          secure: config.nodeEnv === 'production', // HTTPS only in production
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        // Redirect to frontend with success
        res.redirect(`${config.frontendUrl}/?login=success`);
      } catch (error) {
        console.error('User creation/update error:', error.message);
        res.redirect(`${config.frontendUrl}/login?error=server_error`);
      }
    });
  } catch (error) {
    console.error('Steam callback error:', error.message);
    res.redirect(`${config.frontendUrl}/login?error=server_error`);
  }
};

/**
 * Get current authenticated user
 */
export const getCurrentUser = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
    }

    // Return user data without sensitive fields
    const userData = {
      id: req.user._id,
      steamId: req.user.steamId,
      name: req.user.name,
      avatar: req.user.avatar,
      profileUrl: req.user.profileUrl,
      trustScore: req.user.trustScore,
      isCaptainEligible: req.user.isCaptainEligible,
      isAdmin: req.user.isAdmin,
      stats: req.user.stats,
      winRate: req.user.winRate,
      inQueue: req.user.inQueue,
      currentMatch: req.user.currentMatch,
      createdAt: req.user.createdAt,
      lastLogin: req.user.lastLogin,
    };

    res.json({
      success: true,
      user: userData,
    });
  } catch (error) {
    console.error('Get current user error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get user data',
    });
  }
};

/**
 * Logout - clear JWT cookie
 */
export const logout = (req, res) => {
  try {
    res.clearCookie('token', {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
    });

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to logout',
    });
  }
};

/**
 * Update user profile (name, avatar)
 */
export const updateProfile = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const { name, avatar } = req.body;

    // Update allowed fields
    if (name) {
      req.user.name = name;
    }
    if (avatar) {
      req.user.avatar = avatar;
    }

    await req.user.save();

    res.json(req.user);
  } catch (error) {
    console.error('Update profile error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile',
    });
  }
};

/**
 * Upload avatar image
 */
export const uploadAvatar = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    // Delete old avatar if it exists and is not a Steam avatar
    if (req.user.avatar) {
      deleteOldAvatar(req.user.avatar);
    }

    // Update user avatar with new uploaded file URL
    const avatarUrl = `${config.apiUrl}/uploads/avatars/${req.file.filename}`;
    req.user.avatar = avatarUrl;
    await req.user.save();

    res.json({
      success: true,
      message: 'Avatar uploaded successfully',
      avatar: avatarUrl,
      user: req.user
    });
  } catch (error) {
    console.error('Upload avatar error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to upload avatar',
    });
  }
};

export default {
  steamLogin,
  steamCallback,
  getCurrentUser,
  logout,
  updateProfile,
  uploadAvatar,
};
