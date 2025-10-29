import passport from 'passport';
import { Strategy as SteamStrategy } from 'passport-steam';
import config from './env.js';

console.log('Initializing Passport.js...');
console.log('Steam Config:', {
  apiKey: config.steamApiKey ? '***SET***' : '***NOT SET***',
  returnURL: config.steamReturnUrl,
  realm: config.steamRealm,
});

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  done(null, obj);
});

passport.use(new SteamStrategy({
    returnURL: config.steamReturnUrl,
    realm: config.steamRealm,
    apiKey: config.steamApiKey
  },
  (identifier, profile, done) => {
    console.log('Steam strategy verification callback called');
    console.log('Identifier:', identifier);
    console.log('Profile received from Steam:', profile);
    
    try {
      // Extract Steam ID from identifier (format: https://steamcommunity.com/openid/id/STEAMID64)
      const steamIdMatch = identifier.match(/\d+$/);
      if (!steamIdMatch) {
        console.error('Could not extract Steam ID from identifier:', identifier);
        return done(new Error('Could not extract Steam ID'));
      }
      
      const steamId = steamIdMatch[0];
      profile.id = steamId;
      console.log('Steam strategy successful for steamId:', steamId);
      return done(null, profile);
    } catch (error) {
      console.error('Steam strategy error:', error);
      return done(error);
    }
  }
));

export default passport;
