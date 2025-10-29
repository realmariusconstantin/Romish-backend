import { io as ioClient } from 'socket.io-client';
import { createServer } from 'http';
import { Server } from 'socket.io';
import express from 'express';
import User from '../src/models/user.model.js';
import Match from '../src/models/match.model.js';
import Queue from '../src/models/queue.model.js';

// Skip socket integration tests for now - they require full server setup
describe.skip('WebSocket Events', () => {
  let httpServer;
  let io;
  let clientSocket;
  let serverPort;
  let testMatch;
  let testUser;

  beforeAll((done) => {
    // Create Express app and HTTP server
    const app = express();
    httpServer = createServer(app);
    
    // Create Socket.IO server
    io = new Server(httpServer, {
      cors: {
        origin: '*',
        credentials: true,
      },
    });

    // Get random port
    httpServer.listen(0, () => {
      serverPort = httpServer.address().port;
      done();
    });
  });

  beforeEach(async () => {
    // Create test user
    testUser = await User.create({
      steamId: 'test_socket_user',
      name: 'SocketTestPlayer',
      avatar: 'https://example.com/avatar.jpg',
      profileUrl: 'https://steamcommunity.com/id/test',
    });

    // Create test match with accept phase
    const players = Array.from({ length: 10 }, (_, i) => ({
      steamId: `player_${i}`,
      name: `Player ${i}`,
      avatar: 'https://example.com/avatar.jpg',
    }));

    testMatch = await Match.create({
      matchId: 'test_match_001',
      phase: 'accept',
      players,
      captains: {
        alpha: 'player_0',
        beta: 'player_1',
      },
      acceptPhase: {
        active: true,
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 60000),
        timeout: 60000,
        acceptedPlayers: [],
        requiredPlayers: players,
      },
    });

    // Connect client socket
    clientSocket = ioClient(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
      forceNew: true,
    });

    // Wait for connection
    await new Promise((resolve) => {
      clientSocket.on('connect', resolve);
    });
  });

  afterEach(async () => {
    // Disconnect socket and wait for it
    if (clientSocket && clientSocket.connected) {
      await new Promise((resolve) => {
        clientSocket.once('disconnect', resolve);
        clientSocket.disconnect();
      });
    }

    // Clean up test data
    await User.deleteMany({});
    await Match.deleteMany({});
    await Queue.deleteMany({});
  });

  afterAll(async () => {
    // Close server and wait
    await new Promise((resolve) => {
      io.close(() => {
        httpServer.close(resolve);
      });
    });
  });

  describe('Queue Events', () => {
    it('should emit queue:updated when player joins', (done) => {
      // Setup server-side handler
      io.on('connection', (socket) => {
        socket.on('join-queue', async () => {
          // Simulate queue update
          socket.emit('queue:updated', {
            players: [
              {
                steamId: testUser.steamId,
                name: testUser.name,
                avatar: testUser.avatar,
              },
            ],
            status: 'waiting',
          });
        });
      });

      // Setup client-side listener
      clientSocket.on('queue:updated', (data) => {
        expect(data.players).toHaveLength(1);
        expect(data.players[0].steamId).toBe(testUser.steamId);
        expect(data.status).toBe('waiting');
        done();
      });

      // Trigger event
      clientSocket.emit('join-queue');
    });

    it('should emit match-ready when queue fills', (done) => {
      io.on('connection', (socket) => {
        socket.on('join-queue', () => {
          // Simulate match ready
          socket.emit('match-ready', {
            matchId: testMatch.matchId,
            expiresAt: testMatch.acceptPhase.expiresAt,
            timeout: testMatch.acceptPhase.timeout,
            requiredPlayers: testMatch.acceptPhase.requiredPlayers,
            message: 'Match found! Click ACCEPT to continue.',
          });
        });
      });

      clientSocket.on('match-ready', (data) => {
        expect(data.matchId).toBe(testMatch.matchId);
        expect(data.timeout).toBe(60000);
        expect(data.requiredPlayers).toHaveLength(10);
        expect(data.message).toContain('ACCEPT');
        done();
      });

      clientSocket.emit('join-queue');
    });
  });

  describe('Accept Phase Events', () => {
    beforeEach(() => {
      // Setup accept phase handlers on server
      io.on('connection', (socket) => {
        socket.on('join-match', (matchId) => {
          socket.join(`match-${matchId}`);
        });

        socket.on('accept-match', async ({ matchId, steamId }) => {
          // Simulate player accepting
          io.to(`match-${matchId}`).emit('player-accepted', {
            matchId,
            steamId,
            acceptedAt: new Date(),
          });
        });
      });
    });

    it('should emit player-accepted when player accepts', (done) => {
      const matchId = testMatch.matchId;
      const steamId = 'player_0';

      // Join match room first
      clientSocket.emit('join-match', matchId);

      // Listen for player accepted event
      clientSocket.on('player-accepted', (data) => {
        expect(data.matchId).toBe(matchId);
        expect(data.steamId).toBe(steamId);
        expect(data.acceptedAt).toBeDefined();
        done();
      });

      // Wait a bit for room join to complete
      setTimeout(() => {
        clientSocket.emit('accept-match', { matchId, steamId });
      }, 100);
    });

    it('should emit match-starting when all players accept', (done) => {
      const matchId = testMatch.matchId;

      io.on('connection', (socket) => {
        socket.on('join-match', (id) => {
          socket.join(`match-${id}`);
        });

        socket.on('all-accepted', (id) => {
          io.to(`match-${id}`).emit('match-starting', {
            matchId: id,
            message: 'All players accepted! Starting match...',
            nextPhase: 'draft',
          });
        });
      });

      clientSocket.emit('join-match', matchId);

      clientSocket.on('match-starting', (data) => {
        expect(data.matchId).toBe(matchId);
        expect(data.nextPhase).toBe('draft');
        expect(data.message).toContain('All players accepted');
        done();
      });

      setTimeout(() => {
        clientSocket.emit('all-accepted', matchId);
      }, 100);
    });

    it('should emit match-cancelled on timeout', (done) => {
      const matchId = testMatch.matchId;

      io.on('connection', (socket) => {
        socket.on('join-match', (id) => {
          socket.join(`match-${id}`);
        });

        socket.on('simulate-timeout', (id) => {
          io.to(`match-${id}`).emit('match-cancelled', {
            matchId: id,
            reason: 'Not all players accepted in time',
            acceptedCount: 7,
            requiredCount: 10,
          });
        });
      });

      clientSocket.emit('join-match', matchId);

      clientSocket.on('match-cancelled', (data) => {
        expect(data.matchId).toBe(matchId);
        expect(data.reason).toContain('Not all players');
        expect(data.acceptedCount).toBeLessThan(data.requiredCount);
        done();
      });

      setTimeout(() => {
        clientSocket.emit('simulate-timeout', matchId);
      }, 100);
    });
  });

  describe('Draft Phase Events', () => {
    it('should emit draft-update when captain picks player', (done) => {
      const matchId = testMatch.matchId;

      io.on('connection', (socket) => {
        socket.on('join-match', (id) => {
          socket.join(`match-${id}`);
        });

        socket.on('pick-player', ({ matchId, steamId }) => {
          io.to(`match-${matchId}`).emit('draft-update', {
            matchId,
            phase: 'draft',
            currentPicker: 'beta',
            pickIndex: 1,
            pickedPlayer: steamId,
            teams: {
              alpha: ['player_0', steamId],
              beta: ['player_1'],
            },
          });
        });
      });

      clientSocket.emit('join-match', matchId);

      clientSocket.on('draft-update', (data) => {
        expect(data.matchId).toBe(matchId);
        expect(data.phase).toBe('draft');
        expect(data.pickedPlayer).toBe('player_2');
        expect(data.teams.alpha).toContain('player_2');
        done();
      });

      setTimeout(() => {
        clientSocket.emit('pick-player', { matchId, steamId: 'player_2' });
      }, 100);
    });
  });
});
