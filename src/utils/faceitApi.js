/**
 * FACEIT API Integration
 * Fetches player data from FACEIT using Steam ID
 */

import axios from 'axios';
import config from '../config/env.js';

const FACEIT_API_URL = 'https://open.faceit.com/data/v4';

/**
 * Get FACEIT player data by Steam ID
 * @param {string} steamId - Steam ID (64-bit format)
 * @returns {Object|null} FACEIT player data or null if not found
 */
export const getFaceitPlayerBySteam = async (steamId) => {
  try {
    if (!config.faceitApiKey) {
      console.warn('[FACEIT] API key not configured');
      return null;
    }

    const response = await axios.get(
      `${FACEIT_API_URL}/players`,
      {
        params: {
          game: 'cs2',
          game_player_id: steamId
        },
        headers: {
          'Authorization': `Bearer ${config.faceitApiKey}`,
          'Accept': 'application/json'
        },
        timeout: 5000
      }
    );

    if (response.data) {
      const player = response.data;
      const cs2Game = player.games?.cs2;

      return {
        faceitId: player.player_id,
        faceitLevel: cs2Game?.skill_level || null,
        faceitElo: cs2Game?.faceit_elo || null,
        nickname: player.nickname,
        avatar: player.avatar || null,
        country: player.country || null
      };
    }

    return null;
  } catch (error) {
    if (error.response?.status === 404) {
      console.log(`[FACEIT] Player not found for Steam ID: ${steamId}`);
      return null;
    }
    
    console.error(`[FACEIT] Error fetching player data:`, error.message);
    return null;
  }
};

/**
 * Update user's FACEIT data
 * @param {Object} user - Mongoose user document
 * @returns {boolean} Success status
 */
export const updateUserFaceitData = async (user) => {
  try {
    // Don't update if recently updated (cache for 1 hour)
    if (user.faceitLastUpdated) {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (user.faceitLastUpdated > hourAgo) {
        console.log(`[FACEIT] Using cached data for ${user.name}`);
        return true;
      }
    }

    const faceitData = await getFaceitPlayerBySteam(user.steamId);
    
    if (faceitData) {
      user.faceitLevel = faceitData.faceitLevel;
      user.faceitElo = faceitData.faceitElo;
      user.faceitId = faceitData.faceitId;
      user.faceitLastUpdated = new Date();
      await user.save();
      
      console.log(`✅ Updated FACEIT data for ${user.name}: Level ${faceitData.faceitLevel}, Elo ${faceitData.faceitElo}`);
      return true;
    } else {
      console.log(`ℹ️ No FACEIT account found for ${user.name}`);
      return false;
    }
  } catch (error) {
    console.error(`[FACEIT] Error updating user data:`, error.message);
    return false;
  }
};

/**
 * Bulk update FACEIT data for multiple users
 * @param {Array} users - Array of user documents
 * @returns {Object} Update results
 */
export const bulkUpdateFaceitData = async (users) => {
  const results = {
    updated: 0,
    notFound: 0,
    errors: 0
  };

  for (const user of users) {
    try {
      const success = await updateUserFaceitData(user);
      if (success) {
        results.updated++;
      } else {
        results.notFound++;
      }
    } catch (error) {
      results.errors++;
    }
  }

  return results;
};

export default {
  getFaceitPlayerBySteam,
  updateUserFaceitData,
  bulkUpdateFaceitData
};
