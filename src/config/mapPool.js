/**
 * CS2 Map Pool with Workshop IDs
 * Maps match configuration for MatchZy
 */

export const MAP_POOL = {
  'Dust II': {
    id: 'de_dust2',
    workshopId: null, // Built-in map
    displayName: 'Dust II'
  },
  'Mirage': {
    id: 'de_mirage',
    workshopId: null,
    displayName: 'Mirage'
  },
  'Inferno': {
    id: 'de_inferno',
    workshopId: null,
    displayName: 'Inferno'
  },
  'Nuke': {
    id: 'de_nuke',
    workshopId: null,
    displayName: 'Nuke'
  },
  'Overpass': {
    id: 'de_overpass',
    workshopId: null,
    displayName: 'Overpass'
  },
  'Vertigo': {
    id: 'de_vertigo',
    workshopId: null,
    displayName: 'Vertigo'
  },
  'Ancient': {
    id: 'de_ancient',
    workshopId: null,
    displayName: 'Ancient'
  },
  'Anubis': {
    id: 'de_anubis',
    workshopId: null,
    displayName: 'Anubis'
  },
  'Cache': {
    id: '3437809122',
    workshopId: '3437809122',
    displayName: 'Cache'
  },
  'Cobblestone': {
    id: '3070293560',
    workshopId: '3070293560',
    displayName: 'Cobblestone'
  },
  'Train': {
    id: '3070284539',
    workshopId: '3070284539',
    displayName: 'Train'
  },
  'Aztec': {
    id: '3079692971',
    workshopId: '3079692971',
    displayName: 'Aztec'
  }
};

/**
 * Get map ID for MatchZy config
 * @param {string} mapName - Display name of the map
 * @returns {string} Map ID (de_* or workshop ID)
 */
export const getMapId = (mapName) => {
  const map = MAP_POOL[mapName];
  return map ? map.id : mapName.toLowerCase().replace(/\s+/g, '_');
};

/**
 * Get all map names
 * @returns {string[]} Array of map display names
 */
export const getAllMapNames = () => {
  return Object.keys(MAP_POOL);
};

export default MAP_POOL;
