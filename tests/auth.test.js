import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import User from '../src/models/user.model.js';
import { config } from '../src/config/env.js';

describe('Auth API', () => {
  let testUser;
  let authToken;
  let refreshToken;

  beforeEach(async () => {
    // Create a test user
    testUser = await User.create({
      steamId: 'test_steam_auth',
      name: 'TestAuthPlayer',
      avatar: 'https://example.com/avatar.jpg',
      profileUrl: 'https://steamcommunity.com/id/test',
    });

    // Generate JWT tokens for the test user (access and refresh)
    const tokens = await import('../src/auth/cookies.js');
    const tokenPayload = {
      userId: testUser._id,
      steamId: testUser.steamId,
      username: testUser.name,
    };
    
    const issuedTokens = tokens.issueTokens(tokenPayload);
    authToken = issuedTokens.accessToken;
    refreshToken = issuedTokens.refreshToken;
  });

  afterEach(async () => {
    // Clean up test data
    await User.deleteMany({});
  });

  describe('GET /api/auth/me', () => {
    it('should return user profile for authenticated user', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.steamId).toBe(testUser.steamId);
      expect(response.body.user.username).toBe(testUser.name);
    });

    it('should return 401 for unauthenticated user', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(response.body.error).toBe('No authorization token');
    });

    it('should handle concurrent requests without 429 errors', async () => {
      // Make multiple concurrent requests to /api/auth/me
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${authToken}`)
        );
      }

      const responses = await Promise.all(promises);

      // All should succeed (not return 429)
      responses.forEach(response => {
        expect(response.status).not.toBe(429);
        expect(response.status).toBe(200);
      });
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh token for valid session', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `romish_rt=${refreshToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.accessToken).toBeDefined();
    });

    it('should return 401 for invalid token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `romish_rt=invalid-token`)
        .expect(401);

      expect(response.body.error).toBe('Refresh token invalid or expired');
    });
  });

  describe('POST /api/auth/verify', () => {
    it('should verify valid token', async () => {
      const response = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.steamId).toBe(testUser.steamId);
    });

    it('should attempt refresh for expired token', async () => {
      // Create expired token
      const expiredToken = jwt.sign(
        { userId: testUser._id, steamId: testUser.steamId },
        config.jwtSecret,
        { expiresIn: '-1h' } // Already expired
      );

      const response = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      // Should fail for expired token
      expect(response.body.error).toBe('Invalid or expired token');
    });
  });
});