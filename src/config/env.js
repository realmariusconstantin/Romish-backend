import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 5000,
  apiUrl: process.env.API_URL || 'http://localhost:5000',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5174',

  // Database
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/romish',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'your_jwt_secret_key_change_this_in_production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '14d', // 2 weeks

  // Steam
  steamApiKey: process.env.STEAM_API_KEY,
  steamRealm: process.env.STEAM_REALM || 'http://localhost:5000',
  steamReturnUrl: process.env.STEAM_RETURN_URL || 'http://localhost:5000/api/auth/steam/return',

  // Discord
  discordBotToken: process.env.DISCORD_BOT_TOKEN,
  discordGuildId: process.env.DISCORD_GUILD_ID,
  discordVerifiedRoleId: process.env.DISCORD_VERIFIED_ROLE_ID,
  discordApiEndpoint: process.env.DISCORD_API_ENDPOINT || 'http://localhost:3001/api/verify',

  // Dathost
  dathostEmail: process.env.DATHOST_EMAIL,
  dathostPassword: process.env.DATHOST_PASSWORD,
  dathostServerId: process.env.DATHOST_SERVER_ID,
  dathostApiUrl: process.env.DATHOST_API_URL || 'https://dathost.net/api/0.1',

  // FTP
  ftpHost: process.env.FTP_HOST,
  ftpPort: process.env.FTP_PORT ? parseInt(process.env.FTP_PORT, 10) : 21,
  ftpUser: process.env.FTP_USER,
  ftpPass: process.env.FTP_PASS,

  // Server
  serverIp: process.env.SERVER_IP || 'irish.scrim.club',
  serverPort: process.env.SERVER_PORT || 25904,

  // RCON
  rconHost: process.env.RCON_HOST || 'irish.scrim.club',
  rconPort: process.env.RCON_PORT ? parseInt(process.env.RCON_PORT, 10) : 25904,
  rconPassword: process.env.RCON_PASSWORD,

  // FACEIT
  faceitApiKey: process.env.FACEIT_API_KEY,

  // Match Config
  queueSize: parseInt(process.env.QUEUE_SIZE) || 10,
  captainPickTimeout: parseInt(process.env.CAPTAIN_PICK_TIMEOUT) || 60000,
  mapBanTimeout: parseInt(process.env.MAP_BAN_TIMEOUT) || 30000,

  // Feature flags
  skipAcceptPhase: process.env.SKIP_ACCEPT_PHASE === 'true',

  // Security
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
};

// Validation
if (!config.steamApiKey && config.nodeEnv === 'production') {
  console.warn('WARNING: STEAM_API_KEY is not set in production!');
}

if (!config.jwtSecret || config.jwtSecret === 'your_jwt_secret_key_change_this_in_production') {
  console.warn('WARNING: Using default JWT_SECRET. Generate a secure secret for production!');
}

export default config;
