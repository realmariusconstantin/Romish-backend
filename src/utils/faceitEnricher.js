/**
 * Enrich match player data with FACEIT information
 * Called when fetching match details to add FACEIT levels
 */

import User from '../models/user.model.js';
import { updateUserFaceitData } from './faceitApi.js';

/**
 * Enrich players array with FACEIT data
 * @param {Array} players - Array of player objects from match
 * @returns {Array} Players with added faceitLevel field
 */
export const enrichPlayersWithFaceit = async (players) => {
  const enrichedPlayers = [];

  for (const player of players) {
    let faceitLevel = null;
    
    // Check if this is a sim player
    if (player.steamId.startsWith('SIM_PLAYER_')) {
      faceitLevel = 3; // Sim players default to level 3
    } else {
      // Fetch user from database
      const user = await User.findOne({ steamId: player.steamId });
      
      if (user) {
        // Update FACEIT data if stale (older than 1 hour) or missing
        if (!user.faceitLevel || !user.faceitLastUpdated || 
            (Date.now() - new Date(user.faceitLastUpdated).getTime()) > 3600000) {
          await updateUserFaceitData(user);
        }
        
        faceitLevel = user.faceitLevel;
      }
    }

    enrichedPlayers.push({
      ...player.toObject ? player.toObject() : player,
      faceitLevel
    });
  }

  return enrichedPlayers;
};

/**
 * Get FACEIT level for a single player
 * @param {string} steamId - Steam ID
 * @returns {number|null} FACEIT level or null
 */
export const getPlayerFaceitLevel = async (steamId) => {
  // Sim players get level 3
  if (steamId.startsWith('SIM_PLAYER_')) {
    return 3;
  }

  const user = await User.findOne({ steamId });
  if (!user) return null;

  // Update if stale
  if (!user.faceitLevel || !user.faceitLastUpdated || 
      (Date.now() - new Date(user.faceitLastUpdated).getTime()) > 3600000) {
    await updateUserFaceitData(user);
  }

  return user.faceitLevel;
};

export default {
  enrichPlayersWithFaceit,
  getPlayerFaceitLevel
};
