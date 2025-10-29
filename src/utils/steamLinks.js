import fs from 'fs';
import path from 'path';

// Path to steamlinks.json from CS10MAN bot
const STEAM_LINKS_PATH = 'C:\\Users\\mariu\\Desktop\\cs10man-bot\\CS10MAN\\data\\steamlinks.json';

// Cache for steamlinks data (to avoid reading file on every request)
let steamLinksCache = null;
let lastLoadTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Load steamlinks.json data with caching
 */
function loadSteamLinks() {
  const now = Date.now();
  
  // Return cached data if still valid
  if (steamLinksCache && (now - lastLoadTime) < CACHE_DURATION) {
    return steamLinksCache;
  }

  try {
    const data = fs.readFileSync(STEAM_LINKS_PATH, 'utf8');
    steamLinksCache = JSON.parse(data);
    lastLoadTime = now;
    return steamLinksCache;
  } catch (error) {
    console.error('Error loading steamlinks.json:', error.message);
    return [];
  }
}

/**
 * Find Discord ID for a given Steam ID
 * @param {string} steamId - Steam ID to look up
 * @returns {string|null} Discord ID if found, null otherwise
 */
export function getDiscordIdBySteamId(steamId) {
  const steamLinks = loadSteamLinks();
  const link = steamLinks.find(item => item.steamId === steamId);
  return link ? link.discordId : null;
}

/**
 * Refresh the cache (call this if steamlinks.json is updated)
 */
export function refreshSteamLinksCache() {
  steamLinksCache = null;
  lastLoadTime = 0;
}

export default {
  getDiscordIdBySteamId,
  refreshSteamLinksCache,
};
