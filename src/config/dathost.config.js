import config from './env.js';

export const dathostConfig = {
  email: config.dathostEmail,
  password: config.dathostPassword,
  apiUrl: config.dathostApiUrl,

  // Server configuration defaults
  serverDefaults: {
    name: 'Romish Match Server',
    game: 'csgo', // CS2 uses 'csgo' in Dathost API
    location: 'EU', // or 'NA', 'AS', etc.
    slots: 12, // 10 players + 2 GOTV slots
    server_type: 'csgo-5v5',
    csgo_settings: {
      rcon: '',
      password: '',
      steam_game_server_login_token: '',
      tickrate: 128,
      mapgroup: 'mg_active',
      startmap: 'de_dust2',
    },
  },

  // Match server configuration
  matchServerConfig: {
    tickrate: 128,
    slots: 12,
    enable_gotv: true,
    gotv_port: 27020,
    enable_plugins: true,
    plugins: ['prac', 'get5'], // Match plugin for competitive 5v5
  },

  // TODO: Integrate Dathost API for automatic server provisioning
  //
  // Implementation steps:
  // 1. When match phase = "live", call createMatchServer()
  // 2. Configure server with team rosters, map, password
  // 3. Store server IP and RCON password in match.serverInfo
  // 4. Send server connection details to players
  // 5. Monitor match via RCON or Get5 webhooks
  // 6. Delete server when match completes
  //
  // Example usage in match.controller.js:
  // const server = await dathostApi.createMatchServer({
  //   map: match.map,
  //   teamA: match.teams.alpha,
  //   teamB: match.teams.beta,
  //   password: generatePassword(),
  // });
  //
  // match.serverInfo = {
  //   ip: `${server.ip}:${server.ports.game}`,
  //   password: server.csgo_settings.password,
  //   rcon: server.csgo_settings.rcon,
  //   serverId: server.id,
  // };
};

export default dathostConfig;
