import config from './env.js';

export const steamConfig = {
  apiKey: config.steamApiKey,
  realm: config.steamRealm,
  returnUrl: config.steamReturnUrl,
  
  // Steam API endpoints
  endpoints: {
    playerSummaries: 'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/',
    resolveVanityUrl: 'https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/',
  },

  // OpenID configuration
  openid: {
    providerIdentifier: 'https://steamcommunity.com/openid',
    realm: config.steamRealm,
    returnURL: config.steamReturnUrl,
    stateless: false,
    profile: true,
  },
};

export default steamConfig;
