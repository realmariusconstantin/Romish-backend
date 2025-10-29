import axios from 'axios';
import { dathostConfig } from '../config/dathost.config.js';
import fs from 'fs';
import ftp from 'basic-ftp';
import path from 'path';

// Create base64 auth header
const getAuthHeader = () => {
  const auth = Buffer.from(
    `${dathostConfig.email}:${dathostConfig.password}`
  ).toString('base64');
  return `Basic ${auth}`;
};

/**
 * Create a CS2 match server
 * @param {Object} matchConfig - Match configuration
 * @returns {Promise<Object>} Server details
 */
export const createMatchServer = async (matchConfig) => {
  try {
    console.log(`🔧 Creating Dathost server for match ${matchConfig.matchId}...`);
    
    const password = generatePassword(10);
    const rconPassword = generatePassword(16);
    
    const requestData = {
      name: `Romish Match ${matchConfig.matchId}`,
      game: 'csgo', // CS2 uses 'csgo' game identifier in Dathost API
      location: 'europe',
      autostop: true,
      autostop_minutes: 30,
      csgo_settings: {
        password: password,
        rcon: rconPassword,
        tickrate: 128,
        mapgroup: 'mg_active',
        startmap: convertMapName(matchConfig.map),
        enable_gotv: true,
        enable_sourcemod: false,
      },
    };
    
    console.log(`📋 Request data:`, JSON.stringify(requestData, null, 2));
    
    const response = await axios.post(
      `${dathostConfig.apiUrl}/game-servers`,
      requestData,
      {
        headers: {
          'Authorization': getAuthHeader(),
          'Content-Type': 'application/json',
        },
      }
    );
    
    console.log(`📦 Response status: ${response.status}`);
    console.log(`📦 Response data:`, JSON.stringify(response.data, null, 2));
    
    const server = response.data;
    
    console.log(`✅ Dathost server created: ${server.id}`);
    console.log(`   IP: ${server.ip}:${server.ports.game}`);
    
    return {
      id: server.id,
      ip: server.ip,
      port: server.ports.game,
      password: password,
      rconPassword: rconPassword,
    };
  } catch (error) {
    console.error('❌ Dathost API error (createServer):');
    console.error('   Status:', error.response?.status);
    console.error('   Data:', JSON.stringify(error.response?.data, null, 2));
    console.error('   Message:', error.message);
    throw new Error(`Failed to create match server: ${error.response?.data?.message || error.message}`);
  }
};

/**
 * Delete a Dathost server
 * @param {string} serverId - Dathost server ID
 * @returns {Promise<boolean>} Success status
 */
export const deleteMatchServer = async (serverId) => {
  try {
    console.log(`🛑 Deleting Dathost server ${serverId}...`);
    
    const response = await axios.delete(
      `${dathostConfig.apiUrl}/game-servers/${serverId}`,
      {
        headers: {
          'Authorization': getAuthHeader(),
        },
      }
    );
    
    console.log(`✅ Dathost server ${serverId} deleted`);
    return true;
  } catch (error) {
    console.error('❌ Dathost API error (deleteServer):', error.response?.data || error.message);
    return false;
  }
};

/**
 * Upload a file to Dathost server via FTP
 * @param {string} serverId - Dathost server ID
 * @param {string} localPath - Local file path
 * @param {string} remotePath - Remote path on server (e.g., 'csgo/cfg/MatchZy/config.json')
 * @returns {Promise<boolean>} Success status
 */
export const uploadFile = async (serverId, localPath, remotePath) => {
  const client = new ftp.Client();
  client.ftp.verbose = false; // Set to true for debugging
  
  try {
    console.log(`📤 Uploading ${path.basename(localPath)} to ${remotePath}...`);
    
    // Get FTP credentials from Dathost API
    const response = await axios.get(
      `${dathostConfig.apiUrl}/game-servers/${serverId}`,
      {
        headers: {
          'Authorization': getAuthHeader(),
        },
      }
    );
    
    const server = response.data;
    
    if (!server.ftp_url || !server.ftp_password) {
      throw new Error('FTP credentials not available for server');
    }
    
    // Parse FTP URL (format: ftp://host:port)
    const ftpUrl = new URL(server.ftp_url);
    
    console.log(`   Connecting to FTP: ${ftpUrl.hostname}:${ftpUrl.port || 21}`);
    
    // Connect to FTP server
    await client.access({
      host: ftpUrl.hostname,
      port: parseInt(ftpUrl.port) || 21,
      user: serverId,
      password: server.ftp_password,
      secure: false,
    });
    
    console.log(`   Connected to FTP server`);
    
    // Ensure remote directory exists
    const remoteDir = path.dirname(remotePath).replace(/\\/g, '/');
    try {
      await client.ensureDir(remoteDir);
      console.log(`   Created directory: ${remoteDir}`);
    } catch (err) {
      console.log(`   Directory may already exist: ${remoteDir}`);
    }
    
    // Upload the file
    await client.uploadFrom(localPath, remotePath.replace(/\\/g, '/'));
    
    console.log(`✅ File uploaded successfully: ${remotePath}`);
    
    return true;
  } catch (error) {
    console.error(`❌ FTP upload error (${remotePath}):`, error.message);
    throw new Error(`Failed to upload file via FTP: ${error.message}`);
  } finally {
    client.close();
  }
};

/**
 * Start a Dathost server
 * @param {string} serverId - Dathost server ID
 * @returns {Promise<boolean>} Success status
 */
export const startServer = async (serverId) => {
  try {
    console.log(`▶️  Starting server ${serverId}...`);
    
    await axios.post(
      `${dathostConfig.apiUrl}/game-servers/${serverId}/start`,
      {},
      {
        headers: {
          'Authorization': getAuthHeader(),
        },
      }
    );
    
    console.log(`✅ Server ${serverId} started`);
    return true;
  } catch (error) {
    console.error('❌ Server start error:', error.response?.data || error.message);
    return false;
  }
};

/**
 * Wait for server to be ready
 * @param {string} serverId - Dathost server ID
 * @param {number} maxAttempts - Maximum number of attempts
 * @returns {Promise<boolean>} Success status
 */
export const waitForServer = async (serverId, maxAttempts = 30) => {
  console.log(`⏳ Waiting for server ${serverId} to be ready...`);
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await axios.get(
        `${dathostConfig.apiUrl}/game-servers/${serverId}`,
        {
          headers: {
            'Authorization': getAuthHeader(),
          },
        }
      );
      
      if (response.data.on && response.data.booting === false) {
        console.log(`✅ Server is ready!`);
        return true;
      }
      
      console.log(`   Attempt ${i + 1}/${maxAttempts}: Server status = ${response.data.on ? 'on' : 'off'}, booting = ${response.data.booting}`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    } catch (error) {
      console.log(`   Attempt ${i + 1}/${maxAttempts}: Error checking status`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.error(`❌ Server did not become ready after ${maxAttempts} attempts`);
  return false;
};

/**
 * Get server status and info
 * @param {string} serverId - Dathost server ID
 * @returns {Promise<Object>} Server status
 */
export const getServerStatus = async (serverId) => {
  try {
    console.log(`📊 Getting server status for ${serverId}...`);
    
    const response = await axios.get(
      `${dathostConfig.apiUrl}/game-servers/${serverId}`,
      {
        headers: {
          'Authorization': getAuthHeader(),
        },
      }
    );
    
    const server = response.data;
    
    return {
      id: server.id,
      name: server.name,
      ip: server.ip,
      ports: server.ports,
      status: server.on ? 'online' : 'offline',
      booting: server.booting,
      players: server.players_online,
      maxPlayers: server.players_max,
      map: server.map,
    };
  } catch (error) {
    console.error('❌ Dathost API error (getStatus):', error.response?.data || error.message);
    return null;
  }
};

/**
 * Configure Get5 plugin for competitive match
 * @param {string} serverId - Dathost server ID
 * @param {Object} matchConfig - Match configuration
 * @returns {Promise<boolean>} Success status
 */
export const configureGet5 = async (serverId, matchConfig) => {
  try {
    // TODO: Implement Get5 configuration
    // Get5 is a CS2 match plugin for competitive 5v5 matches
    
    // const get5Config = {
    //   matchid: matchConfig.matchId,
    //   match_title: `Romish Match ${matchConfig.matchId}`,
    //   team1: {
    //     name: 'Team Alpha',
    //     players: matchConfig.teams.alpha,
    //   },
    //   team2: {
    //     name: 'Team Beta',
    //     players: matchConfig.teams.beta,
    //   },
    //   cvars: {
    //     hostname: `Romish Match ${matchConfig.matchId}`,
    //     mp_overtime_enable: 1,
    //     mp_overtime_maxrounds: 6,
    //     mp_overtime_startmoney: 10000,
    //   },
    //   maplist: [convertMapName(matchConfig.map)],
    // };
    
    // await axios.post(
    //   `${dathostConfig.apiUrl}/game-servers/${serverId}/console`,
    //   {
    //     line: `get5_loadmatch_url "https://romish.gg/api/match/${matchConfig.matchId}/get5config.json"`,
    //   },
    //   {
    //     headers: {
    //       'Authorization': getAuthHeader(),
    //     },
    //   }
    // );
    
    console.log(`Get5 configured for match ${matchConfig.matchId}`);
    return true;
  } catch (error) {
    console.error('Get5 configuration error:', error.message);
    return false;
  }
};

/**
 * Send RCON command to server
 * @param {string} serverId - Dathost server ID
 * @param {string} command - RCON command
 * @returns {Promise<string>} Command response
 */
export const sendRconCommand = async (serverId, command) => {
  try {
    console.log(`🎮 Sending RCON command to ${serverId}: ${command}`);
    
    // Try using URLSearchParams for form data instead of JSON
    const params = new URLSearchParams();
    params.append('line', command);
    
    console.log(`   Request URL: ${dathostConfig.apiUrl}/game-servers/${serverId}/console`);
    console.log(`   Command: ${command}`);
    
    const response = await axios.post(
      `${dathostConfig.apiUrl}/game-servers/${serverId}/console`,
      params,
      {
        headers: {
          'Authorization': getAuthHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    
    console.log(`✅ RCON command executed successfully`);
    console.log(`   Response:`, response.data);
    return response.data;
  } catch (error) {
    console.error('❌ RCON command error:');
    console.error('   Status:', error.response?.status);
    console.error('   Data:', JSON.stringify(error.response?.data));
    console.error('   Message:', error.message);
    throw new Error(`Failed to execute RCON command: ${error.response?.data || error.message}`);
  }
};

/**
 * Convert frontend map name to CS2 map file name
 * @param {string} mapName - Frontend map name (e.g., "Dust II")
 * @returns {string} CS2 map file name (e.g., "de_dust2")
 */
export const convertMapName = (mapName) => {
  const mapConversions = {
    'Dust II': 'de_dust2',
    'Mirage': 'de_mirage',
    'Inferno': 'de_inferno',
    'Nuke': 'de_nuke',
    'Overpass': 'de_overpass',
    'Vertigo': 'de_vertigo',
    'Ancient': 'de_ancient',
    'Anubis': 'de_anubis',
    'Cache': 'de_cache',
    'Cobblestone': 'de_cbble',
    'Train': 'de_train',
    'Aztec': 'de_aztec',
  };
  
  return mapConversions[mapName] || 'de_dust2';
};

/**
 * Generate random server password
 * @param {number} length - Password length
 * @returns {string} Random password
 */
export const generatePassword = (length = 12) => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  return password;
};

export default {
  createMatchServer,
  deleteMatchServer,
  uploadFile,
  startServer,
  waitForServer,
  getServerStatus,
  configureGet5,
  sendRconCommand,
  convertMapName,
  generatePassword,
};
