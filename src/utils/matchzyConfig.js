/**
 * MatchZy Configuration Generator
 * Generates gameConfig.json, autoSetup.cfg, and whitelist.cfg for MatchZy plugin
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { getMapId } from '../config/mapPool.js';

/**
 * Generate gameConfig.json for MatchZy
 * @param {Object} match - Match document from MongoDB
 * @param {number} matchId - Match ID counter
 * @returns {Object} MatchZy configuration object
 */
export const generateGameConfig = (match, matchId) => {
  // Build player maps for each team
  const team1Players = {};
  const team2Players = {};

  // Process team alpha
  match.teams.alpha.forEach(steamId => {
    const player = match.players.find(p => p.steamId === steamId);
    if (player) {
      team1Players[steamId] = player.name || 'Player';
    }
  });

  // Process team beta
  match.teams.beta.forEach(steamId => {
    const player = match.players.find(p => p.steamId === steamId);
    if (player) {
      team2Players[steamId] = player.name || 'Player';
    }
  });

  // Get captain names for team names
  const alphaCaptain = match.players.find(p => p.steamId === match.captains.alpha);
  const betaCaptain = match.players.find(p => p.steamId === match.captains.beta);
  
  const team1Name = alphaCaptain ? alphaCaptain.name : 'Team Alpha';
  const team2Name = betaCaptain ? betaCaptain.name : 'Team Beta';

  // Get map ID (convert display name to de_* or workshop ID)
  const mapId = getMapId(match.selectedMap);

  // Build configuration
  const config = {
    matchid: matchId,
    team1: {
      name: team1Name,
      players: team1Players
    },
    team2: {
      name: team2Name,
      players: team2Players
    },
    num_maps: 1,
    maplist: [mapId],
    map_sides: ['knife'], // Knife round decides sides
    spectators: {
      players: {}
    },
    clinch_series: true,
    players_per_team: match.teams.alpha.length,
    cvars: {
      hostname: `Romish.gg: ${team1Name} vs ${team2Name} #${matchId}`,
      mp_friendlyfire: "0",
      mp_match_can_clinch: "1",
      matchzy_force_teamnames: "1",
      matchzy_force_playerlocknames: "1",
      mp_overtime_enable: "1",
      mp_overtime_maxrounds: "6",
      mp_overtime_startmoney: "16000",
      mp_warmup_start: "1",
      mp_warmup_pausetimer: "1",
      mp_do_warmup_period: "1",
      mp_warmuptime: "60",
      mp_warmup_end: "0",
      mp_autoteambalance: "0",
      mp_limitteams: "0",
      matchzy_knife_winner_decision: "stay",
      matchzy_autobalance_teams: "0",
      matchzy_ready_min_players: "1",
      matchzy_disconnect_tolerance_time: "300",
      mp_force_assign_teams: "0",
      mp_respawn_on_death_ct: "0",
      mp_respawn_on_death_t: "0",
      mp_join_grace_time: "60",
      mp_autokick: "0",
      sv_cheats: "0",
      sv_lan: "0",
      sv_hibernate_when_empty: "0",
      mp_endmatch_votenextleveltime: "0",
      mp_roundtime: "1.92",
      mp_roundtime_defuse: "1.92",
      mp_maxrounds: "30",
      sv_log_onefile: "0",
      sv_logflush: "1",
      sv_logfile: "1",
      sv_logecho: "1"
    }
  };

  return config;
};

/**
 * Generate whitelist.cfg for MatchZy
 * Format: One Steam ID per line
 * @param {Object} match - Match document from MongoDB
 * @returns {string} Whitelist file content
 */
export const generateWhitelist = (match) => {
  const steamIds = [
    ...match.teams.alpha,
    ...match.teams.beta
  ];

  return steamIds.join('\n') + '\n';
};

/**
 * Generate autoSetup.cfg for MatchZy
 * This file automatically loads the game config when server starts
 * @returns {string} autoSetup.cfg file content
 */
export const generateAutoSetup = () => {
  // Always load gameConfig.json (not match-specific filename)
  return `matchzy_loadmatch cfg/MatchZy/gameConfig.json\n`;
};

/**
 * Write configuration files to temporary directory
 * @param {Object} match - Match document from MongoDB
 * @param {number} matchId - Match ID counter
 * @returns {Object} Object containing file paths
 */
export const writeConfigFiles = (match, matchId) => {
  const tmpDir = os.tmpdir();
  const timestamp = Date.now();

  // Generate configurations
  const gameConfig = generateGameConfig(match, matchId);
  const whitelist = generateWhitelist(match);
  const autoSetup = generateAutoSetup();

  // Write files
  // Always use gameConfig.json as filename (not match-specific)
  const gameConfigPath = path.join(tmpDir, `gameConfig_${timestamp}.json`);
  const whitelistPath = path.join(tmpDir, `whitelist_${timestamp}.cfg`);
  const autoSetupPath = path.join(tmpDir, `autoSetup_${timestamp}.cfg`);

  fs.writeFileSync(gameConfigPath, JSON.stringify(gameConfig, null, 2), 'utf8');
  fs.writeFileSync(whitelistPath, whitelist, 'utf8');
  fs.writeFileSync(autoSetupPath, autoSetup, 'utf8');

  console.log(`✅ Config files written to temp directory`);
  console.log(`   - gameConfig: ${gameConfigPath}`);
  console.log(`   - whitelist: ${whitelistPath}`);
  console.log(`   - autoSetup: ${autoSetupPath}`);

  return {
    gameConfigPath,
    whitelistPath,
    autoSetupPath,
    cleanup: () => {
      try {
        fs.unlinkSync(gameConfigPath);
        fs.unlinkSync(whitelistPath);
        fs.unlinkSync(autoSetupPath);
        console.log(`🗑️ Cleaned up temporary config files`);
      } catch (err) {
        console.warn(`⚠️ Failed to clean up temp files:`, err.message);
      }
    }
  };
};

export default {
  generateGameConfig,
  generateWhitelist,
  generateAutoSetup,
  writeConfigFiles
};
