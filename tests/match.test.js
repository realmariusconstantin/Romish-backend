import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import User from '../src/models/user.model.js';
import Match from '../src/models/match.model.js';
import ReadySession from '../src/models/readySession.model.js';
import { config } from '../src/config/env.js';

describe('Match API', () => {
  let testUser;
  let authToken;

  beforeEach(async () => {
    // Create a test user
    testUser = await User.create({
      steamId: 'test_steam_match',
      name: 'TestMatchPlayer',
      avatar: 'https://example.com/avatar.jpg',
      profileUrl: 'https://steamcommunity.com/id/test',
    });

    // Generate JWT token for the test user
    authToken = jwt.sign(
      { userId: testUser._id, steamId: testUser.steamId },
      config.jwtSecret,
      { expiresIn: '24h' }
    );
  });

  afterEach(async () => {
    // Clean up test data
    await User.deleteMany({});
    await Match.deleteMany({});
    await ReadySession.deleteMany({});
  });

  describe('GET /api/match/current', () => {
    it('should return current match for user in match', async () => {
      // Create a match with the test user
      const testMatch = await Match.create({
        matchId: 'test-current-match',
        players: [
          { steamId: testUser.steamId, name: testUser.name, avatar: testUser.avatar }
        ],
        captains: {
          alpha: testUser.steamId,
          beta: 'placeholder-beta-captain'
        },
        phase: 'draft',
      });

      // Associate the match with the user
      testUser.currentMatch = testMatch._id;
      await testUser.save();

      const response = await request(app)
        .get('/api/match/current')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.match.matchId).toBe('test-current-match');
      expect(response.body.match.players).toHaveLength(1);
    });

    it('should return 404 if user not in match', async () => {
      const response = await request(app)
        .get('/api/match/current')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('No active match found');
    });
  });
});