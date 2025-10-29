import axios from 'axios';
import { steamConfig } from '../config/steam.config.js';

/**
 * Get player summaries from Steam API
 * @param {string[]} steamIds - Array of Steam IDs (max 100)
 * @returns {Promise<Array>} Player data objects
 */
export const getPlayerSummaries = async (steamIds) => {
  try {
    if (!steamConfig.apiKey) {
      throw new Error('Steam API key not configured');
    }

    const idsString = Array.isArray(steamIds) ? steamIds.join(',') : steamIds;
    
    const response = await axios.get(steamConfig.endpoints.playerSummaries, {
      params: {
        key: steamConfig.apiKey,
        steamids: idsString,
      },
    });

    const players = response.data?.response?.players || [];
    
    return players.map(player => ({
      steamId: player.steamid,
      name: player.personaname,
      avatar: player.avatarfull || player.avatarmedium || player.avatar,
      profileUrl: player.profileurl,
      timeCreated: player.timecreated,
      lastLogoff: player.lastlogoff,
      communityVisibilityState: player.communityvisibilitystate,
    }));
  } catch (error) {
    console.error('Steam API error (getPlayerSummaries):', error.message);
    throw new Error('Failed to fetch player data from Steam');
  }
};

/**
 * Get single player summary
 * @param {string} steamId - Steam ID
 * @returns {Promise<Object>} Player data
 */
export const getPlayerSummary = async (steamId) => {
  const players = await getPlayerSummaries([steamId]);
  return players[0] || null;
};

/**
 * Resolve vanity URL to Steam ID
 * @param {string} vanityUrl - Custom Steam profile URL
 * @returns {Promise<string>} Steam ID
 */
export const resolveVanityUrl = async (vanityUrl) => {
  try {
    if (!steamConfig.apiKey) {
      throw new Error('Steam API key not configured');
    }

    const response = await axios.get(steamConfig.endpoints.resolveVanityUrl, {
      params: {
        key: steamConfig.apiKey,
        vanityurl: vanityUrl,
      },
    });

    const data = response.data?.response;
    
    if (data.success === 1) {
      return data.steamid;
    }
    
    throw new Error('Vanity URL not found');
  } catch (error) {
    console.error('Steam API error (resolveVanityUrl):', error.message);
    throw new Error('Failed to resolve vanity URL');
  }
};

/**
 * Extract Steam ID from OpenID claimed identifier
 * @param {string} claimedId - OpenID claimed identifier
 * @returns {string} Steam ID
 */
export const extractSteamId = (claimedId) => {
  const match = claimedId.match(/\/id\/(\d+)$/);
  return match ? match[1] : null;
};

/**
 * Validate Steam ID format
 * @param {string} steamId - Steam ID to validate
 * @returns {boolean} Is valid
 */
export const isValidSteamId = (steamId) => {
  return /^\d{17}$/.test(steamId);
};

/**
 * Get player's CS2 stats (placeholder for future CS2 API)
 * @param {string} steamId - Steam ID
 * @returns {Promise<Object>} Player CS2 stats
 */
export const getCS2Stats = async (steamId) => {
  // TODO: Integrate CS2/Faceit API when available
  // This is a placeholder for future implementation
  
  console.warn('CS2 stats API not yet implemented');
  
  return {
    steamId,
    kills: 0,
    deaths: 0,
    assists: 0,
    kd: 0,
    headshots: 0,
    mvps: 0,
    rank: 'Unranked',
  };
};

export default {
  getPlayerSummaries,
  getPlayerSummary,
  resolveVanityUrl,
  extractSteamId,
  isValidSteamId,
  getCS2Stats,
};
