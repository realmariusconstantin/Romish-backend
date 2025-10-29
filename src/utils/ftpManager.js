import ftp from 'basic-ftp';
import fs from 'fs';
import path from 'path';
import config from '../config/env.js';

const FTP_CONFIG = {
  host: config.ftpHost,
  port: config.ftpPort,
  user: config.ftpUser,
  password: config.ftpPass,
  secure: false
};

/**
 * Execute an FTP operation with automatic connection management
 * @param {Function} fn - Function that receives the FTP client
 * @returns {Promise<any>} Result of the operation
 */
async function withClient(fn) {
  const client = new ftp.Client();
  client.ftp.verbose = false;
  try {
    console.log(`🔗 Connecting to FTP server ${FTP_CONFIG.host}:${FTP_CONFIG.port}...`);
    await client.access(FTP_CONFIG);
    console.log(`✅ FTP connected`);
    return await fn(client);
  } catch (error) {
    console.error('❌ FTP error:', error.message);
    throw error;
  } finally {
    client.close();
  }
}

/**
 * Ensures the remote directory exists (creates recursively if needed)
 * @param {Object} client - FTP client
 * @param {string} remotePath - Remote file path
 */
async function ensureRemoteDir(client, remotePath) {
  const dirs = remotePath.split('/').slice(0, -1); // all but the file
  let current = '';
  
  for (const dir of dirs) {
    if (!dir) continue;
    current += (current ? '/' : '') + dir;
    
    try {
      await client.cd(`/${current}`);
    } catch {
      try {
        await client.send(`MKD ${dir}`);
        console.log(`📁 Created directory: ${current}`);
      } catch (e) {
        // Directory might already exist, ignore error
      }
      try {
        await client.cd(`/${current}`);
      } catch (err) {
        console.warn(`⚠️  Could not cd to ${current}, continuing...`);
      }
    }
  }
  
  // Always return to root after making dirs
  await client.cd('/');
}

/**
 * Upload a local file to the FTP server
 * @param {string} localPath - Local file path
 * @param {string} remotePath - Remote path on server (e.g., 'csgo/cfg/MatchZy/gameConfig.json')
 * @returns {Promise<boolean>} Success status
 */
export async function uploadFile(localPath, remotePath) {
  return withClient(async (client) => {
    if (!localPath || !remotePath) {
      throw new Error('Missing local or remote path');
    }
    
    if (!fs.existsSync(localPath)) {
      throw new Error(`Local file not found: ${localPath}`);
    }

    const relPath = remotePath.replace(/^\/+/, '');
    
    console.log(`📤 Uploading file to FTP...`);
    console.log(`   Local:  ${localPath}`);
    console.log(`   Remote: ${relPath}`);
    
    await client.cd('/');
    await ensureRemoteDir(client, relPath);
    
    try {
      await client.uploadFrom(localPath, relPath);
      console.log(`✅ File uploaded successfully: ${relPath}`);
      return true;
    } catch (err) {
      console.error(`❌ Failed to upload to ${relPath}:`, err.message);
      throw err;
    }
  });
}

/**
 * Upload multiple files to the FTP server
 * @param {Array<{local: string, remote: string}>} files - Array of file objects
 * @returns {Promise<boolean>} Success status
 */
export async function uploadFiles(files) {
  console.log(`📤 Uploading ${files.length} files to FTP server...`);
  
  for (const file of files) {
    await uploadFile(file.local, file.remote);
  }
  
  console.log(`✅ All ${files.length} files uploaded successfully`);
  return true;
}

/**
 * Download a file from the FTP server
 * @param {string} remotePath - Remote file path
 * @param {string} localPath - Local destination path
 * @returns {Promise<boolean>} Success status
 */
export async function downloadFile(remotePath, localPath) {
  return withClient(async (client) => {
    const relPath = remotePath.replace(/^\/+/, '');
    await client.cd('/');
    
    try {
      await client.downloadTo(localPath, relPath);
      console.log(`✅ Downloaded: ${relPath} → ${localPath}`);
      return true;
    } catch (err) {
      console.error(`❌ Failed to download ${relPath}:`, err.message);
      throw err;
    }
  });
}

/**
 * List contents of a remote directory
 * @param {string} dir - Remote directory path
 * @returns {Promise<Array>} List of files
 */
export async function listDirectory(dir = '') {
  return withClient(async (client) => {
    await client.cd('/');
    if (dir) {
      await client.cd(dir);
    }
    return client.list();
  });
}

export default {
  uploadFile,
  uploadFiles,
  downloadFile,
  listDirectory,
};
