/**
 * Server Provisioning Service
 * Handles server creation and configuration upload to Dathost
 */

import { writeConfigFiles } from './matchzyConfig.js';
import { 
  startServer, 
  waitForServer,
  getServerStatus,
  convertMapName
} from './dathostApi.js';
import { uploadFiles } from './ftpManager.js';
import { executeRconCommand } from './rconClient.js';
import { getNextMatchId } from '../models/counter.model.js';
import { dathostConfig } from '../config/dathost.config.js';
import config from '../config/env.js';
import fs from 'fs';

/**
 * START SERVER - Called when player veto starts
 * This boots up the Dathost server so it is ready when map veto completes
 * @returns {Object} { success: boolean, serverId: string }
 */
export const startMatchServer = async () => {
  try {
    const serverId = config.dathostServerId;
    
    if (!serverId) {
      throw new Error('DATHOST_SERVER_ID not configured in environment');
    }
    
    console.log(`Starting Dathost server: ${serverId}`);
    
    // Start the server
    console.log(`Sending start command...`);
    await startServer(serverId);
    
    // Wait for server to be ready
    console.log(`Waiting for server to boot (checking for up to 20 attempts)...`);
    const isReady = await waitForServer(serverId, 20);
    
    if (!isReady) {
      throw new Error('Server did not become ready in time');
    }
    
    console.log(`Server is booted and ready!`);
    
    return {
      success: true,
      serverId: serverId
    };
    
  } catch (error) {
    console.error(`Failed to start server:`, error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * PROVISION SERVER - Called when map veto ends
 * Uploads configs and executes RCON commands
 * @param {Object} match - Match document
 * @returns {Object} Server info (ip, password, serverId)
 */
export const provisionServer = async (match) => {
  try {
    console.log(`Provisioning server for match ${match.matchId}...`);
    
    const serverId = config.dathostServerId;
    
    if (!serverId) {
      throw new Error('DATHOST_SERVER_ID not configured in environment');
    }
    
    // Step 1: Get next incrementing match ID (starts from 1)
    const matchzyMatchId = await getNextMatchId();
    console.log(`Generated MatchZy match ID: ${matchzyMatchId}`);
    
    // Step 2: Generate MatchZy config files
    console.log(`Generating MatchZy configuration files...`);
    const configFiles = writeConfigFiles(match, matchzyMatchId);
    
    // Step 3: Upload config files via FTP
    console.log(`Uploading configuration files via FTP...`);
    
    const filesToUpload = [
      {
        local: configFiles.gameConfigPath,
        remote: 'cfg/MatchZy/gameConfig.json'  // Always use gameConfig.json filename
      },
      {
        local: configFiles.whitelistPath,
        remote: 'cfg/MatchZy/whitelist.cfg'
      },
      {
        local: configFiles.autoSetupPath,
        remote: 'cfg/MatchZy/autoSetup.cfg'
      }
    ];
    
    await uploadFiles(filesToUpload);
    
    console.log(`All configuration files uploaded successfully`);
    
    // Step 4: Verify server is still running and ready for RCON
    console.log('   ℹ️  Verifying server is ready for RCON...');
    const serverStatus = await getServerStatus(serverId);
    
    if (!serverStatus.on) {
      console.error('   ⚠️  Server is not running! Attempting to start...');
      await startServer(serverId);
      
      // Wait for server to boot
      console.log('   ⏳ Waiting for server to boot...');
      const isReady = await waitForServer(serverId, 20);
      
      if (!isReady) {
        throw new Error('Server did not become ready after restart');
      }
      console.log('   ✅ Server is now ready!');
    } else {
      console.log('   ✅ Server is running and ready');
    }
    
    // Step 5: Wait 7 seconds for files to sync and server to stabilize
    console.log('   ℹ️  Waiting 7 seconds for files to sync and server to stabilize...');
    await new Promise(resolve => setTimeout(resolve, 7000));
    
    // Step 6: Execute the autoSetup config via direct RCON connection
    console.log(`Executing MatchZy autoSetup via direct RCON...`);
    try {
      await executeRconCommand('exec MatchZy/autoSetup.cfg');
      console.log(`MatchZy autoSetup.cfg executed successfully`);
    } catch (rconError) {
      console.error(`RCON execution failed:`, rconError.message);
      console.log(`Server may still work if MatchZy is configured properly`);
    }
    
    // Wait an additional moment for MatchZy to load the config
    console.log(`Waiting for MatchZy to load config (3 seconds)...`);
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log(`Server is ready for players!`);
    
    // Cleanup temporary files
    configFiles.cleanup();
    
    // Use configured server connection info (no password needed)
    const serverIp = config.serverIp;
    const serverPort = config.serverPort;
    
    console.log(`Server connection: ${serverIp}:${serverPort}`);
    
    return {
      success: true,
      serverInfo: {
        ip: serverIp,
        port: serverPort,
        password: '',
        rconPassword: '',
        serverId: serverId,
        connectString: `connect ${serverIp}:${serverPort}`,
      }
    };
    
  } catch (error) {
    console.error(`Server provisioning failed:`, error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Get mock server info (legacy function for compatibility)
 * @deprecated Use startMatchServer() and provisionServer() instead
 */
export const getMockServerInfo = () => {
  console.warn('getMockServerInfo() is deprecated');
  return {
    ip: config.serverIp,
    password: '',
    serverId: config.dathostServerId,
  };
};
