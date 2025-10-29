import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import User from '../src/models/user.model.js';
import Queue from '../src/models/queue.model.js';
import { config } from '../src/config/env.js';

describe('Queue API', () => {
  let testUser;
  let authToken;

  beforeEach(async () => {
    // Create a test user
    testUser = await User.create({
      steamId: 'test_steam_123',
      name: 'TestPlayer',
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
    await Queue.deleteMany({});
  });

  describe('POST /api/queue/join', () => {
    it('should allow authenticated user to join queue', async () => {
      const response = await request(app)
        .post('/api/queue/join')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('queue');
      expect(response.body.queue).toBeDefined();
      expect(response.body.queue.players).toHaveLength(1);
    });

    it('should return 401 for unauthenticated user', async () => {
      const response = await request(app)
        .post('/api/queue/join')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should not allow user to join queue twice', async () => {
      // Join once
      await request(app)
        .post('/api/queue/join')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Try to join again
      const response = await request(app)
        .post('/api/queue/join')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Already in queue');
    });
  });

  describe('POST /api/queue/leave', () => {
    beforeEach(async () => {
      // Join queue first
      await request(app)
        .post('/api/queue/join')
        .set('Authorization', `Bearer ${authToken}`);
    });

    it('should allow user to leave queue', async () => {
      const response = await request(app)
        .post('/api/queue/leave')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return error if user is not in queue', async () => {
      // Leave once
      await request(app)
        .post('/api/queue/leave')
        .set('Authorization', `Bearer ${authToken}`);

      // Try to leave again
      const response = await request(app)
        .post('/api/queue/leave')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/queue/status', () => {
    it('should return current queue status', async () => {
      const response = await request(app)
        .get('/api/queue/status')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.queue).toBeDefined();
      expect(response.body.queue.players).toBeDefined();
      expect(response.body.queue.status).toBeDefined();
    });

    it('should show player in queue after joining', async () => {
      // Join queue
      await request(app)
        .post('/api/queue/join')
        .set('Cookie', `token=${authToken}`);

      // Check status
      const response = await request(app)
        .get('/api/queue/status')
        .expect(200);

      expect(response.body.queue.players).toHaveLength(1);
      expect(response.body.queue.players[0].steamId).toBe(testUser.steamId);
    });

    it('should create ready session when queue reaches 10 players', async () => {
      // Create 9 additional test users and join them to queue
      const additionalUsers = [];
      for (let i = 0; i < 9; i++) {
        const user = await User.create({
          steamId: `test_steam_${i}`,
          name: `TestPlayer${i}`,
          avatar: 'https://example.com/avatar.jpg',
          profileUrl: `https://steamcommunity.com/id/test${i}`,
        });
        additionalUsers.push(user);

        const token = jwt.sign(
          { userId: user._id, steamId: user.steamId },
          config.jwtSecret,
          { expiresIn: '24h' }
        );

        await request(app)
          .post('/api/queue/join')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
      }

      // Join with the 10th player (original test user)
      const response = await request(app)
        .post('/api/queue/join')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Should return provisional match ID and redirect info
      expect(response.body.success).toBe(true);
      expect(response.body.matchId).toBeDefined();
      expect(response.body.matchId).toMatch(/^PEND-/);
      expect(response.body.redirectTo).toContain('/draft/');
      expect(response.body.queue.status).toBe('completed');
      expect(response.body.queue.players).toHaveLength(0);
    });
  });
});
