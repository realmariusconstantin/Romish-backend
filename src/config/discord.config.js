import config from './env.js';

export const discordConfig = {
  botToken: config.discordBotToken,
  guildId: config.discordGuildId,
  verifiedRoleId: config.discordVerifiedRoleId,
  apiEndpoint: config.discordApiEndpoint,

  // Discord API endpoints
  endpoints: {
    getGuildMember: (guildId, userId) => 
      `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`,
    getUserRoles: (guildId, userId) => 
      `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`,
  },

  // TODO: Integrate with your Discord bot
  // This configuration assumes your Discord bot has an API endpoint
  // that can verify if a user is authenticated in your Discord server
  //
  // Example integration:
  // 1. Your Discord bot exposes POST /api/verify endpoint
  // 2. Backend sends { steamId, discordId } to verify
  // 3. Bot checks if user has verified role
  // 4. Bot returns { verified: true/false, roles: [] }
  //
  // Future webhook notifications:
  // - notifyMatchStart(matchId, players)
  // - notifyMatchEnd(matchId, result)
  // - notifyQueueFull(players)
};

export default discordConfig;
