import { checkDiscordVerification } from '../utils/discordApi.js';

/**
 * Verify user has Discord verification
 */
export const requireDiscordVerification = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // Check if user has Discord verification
    if (!req.user.isDiscordVerified) {
      return res.status(403).json({
        success: false,
        error: 'Discord verification required',
        message: 'Please verify your Discord account to access this feature',
        redirectTo: '/discord-verify',
      });
    }

    // Optionally: Re-verify Discord status in real-time
    // if (req.user.discordId) {
    //   const verification = await checkDiscordVerification(req.user.discordId);
    //   
    //   if (!verification.verified) {
    //     req.user.isDiscordVerified = false;
    //     await req.user.save();
    //     
    //     return res.status(403).json({
    //       success: false,
    //       error: 'Discord verification expired',
    //       message: 'Please re-verify your Discord account',
    //     });
    //   }
    // }

    next();
  } catch (error) {
    console.error('Discord verification check error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to verify Discord status',
    });
  }
};

/**
 * Link Discord account (optional middleware for future feature)
 */
export const linkDiscordAccount = async (req, res, next) => {
  try {
    const { discordId } = req.body;

    if (!discordId) {
      return res.status(400).json({
        success: false,
        error: 'Discord ID required',
      });
    }

    // Verify Discord account
    const verification = await checkDiscordVerification(discordId);

    if (!verification.verified) {
      return res.status(403).json({
        success: false,
        error: 'Discord verification failed',
        message: verification.error || 'User not found in Discord server or missing verified role',
      });
    }

    // Attach verification data to request
    req.discordVerification = verification;

    next();
  } catch (error) {
    console.error('Discord linking error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to link Discord account',
    });
  }
};

export default {
  requireDiscordVerification,
  linkDiscordAccount,
};
