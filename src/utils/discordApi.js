import axios from 'axios';
import { discordConfig } from '../config/discord.config.js';

/**
 * Check if user is verified in Discord server
 * @param {string} discordId - Discord user ID
 * @returns {Promise<Object>} Verification status
 */
export const checkDiscordVerification = async (discordId) => {
  try {
    if (!discordConfig.botToken) {
      console.warn('Discord bot token not configured - skipping verification');
      return {
        verified: false,
        error: 'Discord verification not configured',
      };
    }

    // TODO: Integrate with your Discord bot's API endpoint
    // This assumes your Discord bot exposes a verification endpoint
    
    // Option 1: Check via Discord bot's custom API
    // const response = await axios.post(discordConfig.apiEndpoint, {
    //   discordId,
    // }, {
    //   headers: {
    //     'Authorization': `Bearer ${discordConfig.botToken}`,
    //   },
    // });
    
    // Option 2: Check directly via Discord API
    const response = await axios.get(
      discordConfig.endpoints.getGuildMember(discordConfig.guildId, discordId),
      {
        headers: {
          'Authorization': `Bot ${discordConfig.botToken}`,
        },
      }
    );

    const member = response.data;
    
    // Check if user has verified role
    const hasVerifiedRole = member.roles.includes(discordConfig.verifiedRoleId);
    
    return {
      verified: hasVerifiedRole,
      discordId: member.user.id,
      username: `${member.user.username}#${member.user.discriminator}`,
      roles: member.roles,
      joinedAt: member.joined_at,
    };
  } catch (error) {
    console.error('Discord API error (checkVerification):', error.message);
    
    if (error.response?.status === 404) {
      return {
        verified: false,
        error: 'User not found in Discord server',
      };
    }
    
    return {
      verified: false,
      error: 'Failed to verify Discord status',
    };
  }
};

/**
 * Link Steam account to Discord
 * @param {string} steamId - Steam ID
 * @param {string} discordId - Discord user ID
 * @returns {Promise<boolean>} Success status
 */
export const linkSteamToDiscord = async (steamId, discordId) => {
  try {
    // TODO: Integrate with your Discord bot's API
    // This would store the Steam-Discord link in your bot's database
    
    // Example implementation:
    // const response = await axios.post(`${discordConfig.apiEndpoint}/link`, {
    //   steamId,
    //   discordId,
    // }, {
    //   headers: {
    //     'Authorization': `Bearer ${discordConfig.botToken}`,
    //   },
    // });
    
    console.log(`Link request: Steam ${steamId} <-> Discord ${discordId}`);
    return true;
  } catch (error) {
    console.error('Discord API error (linkAccounts):', error.message);
    return false;
  }
};

/**
 * Notify Discord bot of match start
 * @param {Object} match - Match object
 * @returns {Promise<void>}
 */
export const notifyMatchStart = async (match) => {
  try {
    // TODO: Integrate Discord webhook or bot API
    // Send notification to Discord channel when match starts
    
    // const webhook = await axios.post(discordConfig.webhookUrl, {
    //   embeds: [{
    //     title: `🎮 Match Starting: ${match.matchId}`,
    //     description: `Team Alpha vs Team Beta\nMap: ${match.selectedMap}`,
    //     color: 0x00FF00,
    //     fields: [
    //       {
    //         name: 'Team Alpha',
    //         value: match.teams.alpha.map(p => p.name).join('\n'),
    //         inline: true,
    //       },
    //       {
    //         name: 'Team Beta',
    //         value: match.teams.beta.map(p => p.name).join('\n'),
    //         inline: true,
    //       },
    //     ],
    //     timestamp: new Date().toISOString(),
    //   }],
    // });
    
    console.log(`Discord notification: Match ${match.matchId} started`);
  } catch (error) {
    console.error('Discord webhook error:', error.message);
  }
};

/**
 * Notify Discord bot of match completion
 * @param {Object} match - Match object
 * @returns {Promise<void>}
 */
export const notifyMatchComplete = async (match) => {
  try {
    // TODO: Integrate Discord webhook or bot API
    
    console.log(`Discord notification: Match ${match.matchId} completed`);
  } catch (error) {
    console.error('Discord webhook error:', error.message);
  }
};

/**
 * Notify Discord bot when queue is full
 * @param {Array} players - Array of players in queue
 * @returns {Promise<void>}
 */
export const notifyQueueFull = async (players) => {
  try {
    // TODO: Integrate Discord webhook or bot API
    
    console.log('Discord notification: Queue full, match starting');
  } catch (error) {
    console.error('Discord webhook error:', error.message);
  }
};

/**
 * Get Discord user info
 * @param {string} discordId - Discord user ID
 * @returns {Promise<Object>} User info
 */
export const getDiscordUser = async (discordId) => {
  try {
    const response = await axios.get(
      `https://discord.com/api/v10/users/${discordId}`,
      {
        headers: {
          'Authorization': `Bot ${discordConfig.botToken}`,
        },
      }
    );

    return {
      id: response.data.id,
      username: response.data.username,
      discriminator: response.data.discriminator,
      avatar: response.data.avatar ? 
        `https://cdn.discordapp.com/avatars/${response.data.id}/${response.data.avatar}.png` : 
        null,
    };
  } catch (error) {
    console.error('Discord API error (getUser):', error.message);
    return null;
  }
};

export default {
  checkDiscordVerification,
  linkSteamToDiscord,
  notifyMatchStart,
  notifyMatchComplete,
  notifyQueueFull,
  getDiscordUser,
};
