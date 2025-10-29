import RconPackage from 'rcon-srcds';
import config from '../config/env.js';

// Handle CommonJS default export
const Rcon = RconPackage.default || RconPackage;

/**
 * Execute a command on the CS2 server via RCON
 * @param {string} command - The command to execute
 * @returns {Promise<string>} The response from the server
 */
export async function executeRconCommand(command) {
  return new Promise(async (resolve, reject) => {
    const rcon = new Rcon({
      host: config.rconHost,
      port: config.rconPort,
      timeout: 5000
    });

    try {
      console.log(`🎮 Connecting to RCON server ${config.rconHost}:${config.rconPort}...`);
      
      // Connect to the server
      await rcon.authenticate(config.rconPassword);
      console.log(`✅ RCON authenticated successfully`);
      
      // Execute the command
      console.log(`📤 Executing command: ${command}`);
      const response = await rcon.execute(command);
      console.log(`✅ RCON command executed`);
      console.log(`📥 Response: ${response || '(no response)'}`);
      
      // Disconnect
      rcon.disconnect();
      
      resolve(response);
    } catch (error) {
      console.error('❌ RCON error:', error.message);
      rcon.disconnect();
      reject(error);
    }
  });
}

/**
 * Execute multiple commands on the CS2 server via RCON
 * @param {string[]} commands - Array of commands to execute
 * @returns {Promise<string[]>} Array of responses from the server
 */
export async function executeRconCommands(commands) {
  const rcon = new Rcon({
    host: config.rconHost,
    port: config.rconPort,
    timeout: 5000
  });

  try {
    console.log(`🎮 Connecting to RCON server ${config.rconHost}:${config.rconPort}...`);
    
    // Connect and authenticate
    await rcon.authenticate(config.rconPassword);
    console.log(`✅ RCON authenticated successfully`);
    
    const responses = [];
    
    // Execute all commands
    for (const command of commands) {
      console.log(`📤 Executing command: ${command}`);
      const response = await rcon.execute(command);
      console.log(`✅ Command executed`);
      console.log(`📥 Response: ${response || '(no response)'}`);
      responses.push(response);
      
      // Small delay between commands
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Disconnect
    rcon.disconnect();
    
    return responses;
  } catch (error) {
    console.error('❌ RCON error:', error.message);
    rcon.disconnect();
    throw error;
  }
}

export default {
  executeRconCommand,
  executeRconCommands,
};
