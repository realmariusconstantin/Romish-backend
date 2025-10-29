/**
 * Socket.IO Configuration & Namespace Manager
 * @module sockets/index
 */

import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import logger from '../utils/logger.js';
import * as readyService from '../ready/ready.socket.js';
import { createMatchFromReadySession } from '../controllers/queue.controller.js';
import * as chatService from '../chat/chat.socket.js';
import ReadySession from '../models/readySession.model.js';
import Queue from '../models/queue.model.js';
import User from '../models/user.model.js';

let io = null;
let matchNsp = null;
let chatNsp = null;

/**
 * Socket authentication middleware
 */
function socketAuthMiddleware(socket, next) {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      logger.warn('Socket connection rejected: No token provided');
      return next(new Error('Authentication required'));
    }

    // Verify JWT token
    const decoded = jwt.verify(token, config.jwtSecret);
    
    // Attach user info to socket
    socket.userId = decoded.userId;
    socket.username = decoded.username || socket.handshake.auth.username;
    
    logger.debug(`Socket authenticated: ${socket.userId}`);
    next();
  } catch (error) {
    logger.error(`Socket auth failed: ${error.message}`);
    next(new Error('Invalid token'));
  }
}

/**
 * Initialize Socket.IO server and namespaces
 * @param {http.Server} httpServer - HTTP server instance
 * @param {Object} options - Socket.IO options
 * @returns {Promise<Object>} { io, matchNsp, chatNsp }
 */
export async function createSockets(httpServer, options = {}) {
  try {
    io = new Server(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:5173',
        credentials: true,
      },
      ...options,
    });

    // Initialize match namespace (/match)
    matchNsp = io.of('/match');
    matchNsp.use(socketAuthMiddleware); // Add authentication
    setupMatchNamespace(matchNsp);

    // Initialize chat namespace (/chat)
    chatNsp = io.of('/chat');
    chatNsp.use(socketAuthMiddleware); // Add authentication
    setupChatNamespace(chatNsp);

    // Initialize cleanup tasks for chat
    chatService.initializeCleanupTasks();

    // Root namespace: handle simple queue room joins and lightweight events
    io.on('connection', (socket) => {
      logger.debug(`Root namespace connection: socketId=${socket.id}`);

      // Allow clients to join the 'queue' room to receive queue events
      socket.on('join-queue', (ack) => {
        try {
          socket.join('queue');
          logger.debug(`Socket ${socket.id} joined room: queue`);
          if (typeof ack === 'function') ack({ success: true });
        } catch (err) {
          logger.warn('Failed to join queue room:', err.message);
          if (typeof ack === 'function') ack({ success: false, error: err.message });
        }
      });

      socket.on('leave-queue', (ack) => {
        try {
          socket.leave('queue');
          logger.debug(`Socket ${socket.id} left room: queue`);
          if (typeof ack === 'function') ack({ success: true });
        } catch (err) {
          logger.warn('Failed to leave queue room:', err.message);
          if (typeof ack === 'function') ack({ success: false, error: err.message });
        }
      });

      // Allow root-socket clients to join a match room (compat with frontend shared socket)
      socket.on('join-match', (matchId, ack) => {
        try {
          if (!matchId) {
            if (typeof ack === 'function') ack({ success: false, error: 'matchId required' });
            return;
          }
          socket.join(`match-${matchId}`);
          logger.debug(`Root socket ${socket.id} joined room: match-${matchId}`);
          if (typeof ack === 'function') ack({ success: true });
        } catch (err) {
          logger.warn('Root join-match failed:', err.message);
          if (typeof ack === 'function') ack({ success: false, error: err.message });
        }
      });

      socket.on('disconnect', (reason) => {
        logger.debug(`Root socket disconnected: ${socket.id} reason=${reason}`);
      });
    });

    logger.info('Socket.IO initialized with namespaces: /match, /chat');

    return { io, matchNsp, chatNsp };
  } catch (error) {
    logger.error(`Failed to create sockets: ${error.message}`, {
      error: error.stack,
    });
    throw error;
  }
}

/**
 * Setup /match namespace handlers
 * @param {Namespace} nsp - Socket.IO namespace
 */
function setupMatchNamespace(nsp) {
  nsp.on('connection', (socket) => {
    const userId = socket.userId; // Use authenticated userId
    logger.debug(`User connected to /match: ${userId}`);

    socket.on('join:matchRoom', async (data) => {
      try {
        const { matchId } = data;
        if (!matchId) {
          socket.emit('error', { message: 'matchId required' });
          return;
        }

  // Use a consistent room naming convention: `match-<matchId>`
  socket.join(`match-${matchId}`);
        logger.info(
          `User joined match room: { userId: ${userId}, matchId: ${matchId} }`
        );

        // Send current ready session state if exists
        const stats = await getReadySessionStats(matchId);
        if (stats) {
          socket.emit('match:ready:update', stats);
        }
      } catch (error) {
        logger.error('Error joining match room:', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // Backwards-compatible alias used by frontend: 'join-match'
    socket.on('join-match', async (matchId) => {
      try {
        if (!matchId) {
          socket.emit('error', { message: 'matchId required' });
          return;
        }
  socket.join(`match-${matchId}`);
        logger.info(`User joined match room (alias): { userId: ${userId}, matchId: ${matchId} }`);

        // Send current ready session state if exists
        const stats = await getReadySessionStats(matchId);
        if (stats) {
          socket.emit('match:ready:update', stats);
        }
      } catch (error) {
        logger.error('Error joining match room (alias):', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    socket.on('match:ready:accept', async (data) => {
      try {
        const { matchId } = data;
        if (!matchId || !userId) {
          socket.emit('error', { message: 'matchId and authentication required' });
          return;
        }

        const result = await readyService.recordPlayerAccept(matchId, userId);

        if (result.error) {
          socket.emit('match:ready:error', result);
          return;
        }

        // Get updated stats
        const stats = result.stats;

  // Broadcast update to all players in this match (use consistent room name)
  nsp.to(`match-${matchId}`).emit('match:ready:update', stats);

        // Check if all have accepted
        const allAccepted = await readyService.checkAllAccepted(matchId);
        if (allAccepted) {
          await readyService.completeReadyPhase(matchId, 'draft');

          // Create an actual Match document now that all accepted
          try {
            const createdMatch = await createMatchFromReadySession(matchId, io);
            if (createdMatch) {
              // Notify clients (both provisional room and real match room) that match is starting
              io.to(`match-${matchId}`).emit('match:ready:complete', {
                provisionalMatchId: matchId,
                matchId: createdMatch.matchId,
                nextPhase: 'draft',
              });
              io.to(`match-${createdMatch.matchId}`).emit('match:ready:complete', {
                provisionalMatchId: matchId,
                matchId: createdMatch.matchId,
                nextPhase: 'draft',
              });
              io.to('queue').emit('match-starting', {
                matchId: createdMatch.matchId,
                phase: 'draft',
                message: 'Match starting',
              });
            } else {
              io.to(`match-${matchId}`).emit('match:ready:complete', {
                matchId,
                nextPhase: 'draft',
              });
            }
          } catch (err) {
            logger.error('Failed to create match from ready session:', err);
            nsp.to(`match-${matchId}`).emit('match:ready:complete', {
              matchId,
              nextPhase: 'draft',
            });
          }
        }
      } catch (error) {
        logger.error('Error recording accept:', error);
        socket.emit('error', { message: 'Failed to record acceptance' });
      }
    });

    socket.on('disconnect', () => {
      logger.debug(`User disconnected from /match: ${userId}`);
    });
  });
}

/**
 * Setup /chat namespace handlers
 * @param {Namespace} nsp - Socket.IO namespace
 */
function setupChatNamespace(nsp) {
  const globalRoom = 'global';
  // Track sockets per authenticated user to compute unique online users
  const userSocketMap = new Map(); // userId -> Set(socketId)

  nsp.on('connection', async (socket) => {
    const userId = socket.userId; // Use authenticated userId
    const username = socket.username || 'Anonymous'; // Use authenticated username

    // Auto-join global room
    socket.join(globalRoom);

    // Send recent messages to connecting client
    const recentMessages = await chatService.getRecentMessages(50);
    socket.emit('chat:recent', recentMessages);

    // Track socket under authenticated userId
    try {
      if (userId) {
        if (!userSocketMap.has(userId)) userSocketMap.set(userId, new Set());
        userSocketMap.get(userId).add(socket.id);
      }
    } catch (err) {
      logger.warn('Failed to track user socket:', err.message);
    }

    // Compute unique online user count from map (fallback to nsp.sockets.size)
    const onlineCount = (typeof userSocketMap.size === 'number' && userSocketMap.size > 0)
      ? userSocketMap.size
      : ((nsp && nsp.sockets && typeof nsp.sockets.size === 'number')
        ? nsp.sockets.size
        : (io && io.engine && typeof io.engine.clientsCount === 'number' ? io.engine.clientsCount : 0));

    nsp.to(globalRoom).emit('chat:online', { count: onlineCount });

    logger.debug(
      `User connected to /chat: { userId: ${userId}, username: ${username}, onlineUnique: ${onlineCount} }`
    );

    socket.on('chat:send', async (data) => {
      try {
        const { text } = data;

        if (!text || !userId || !username) {
          socket.emit('chat:error', { message: 'Invalid message data' });
          return;
        }

        const savedMessage = await chatService.saveChatMessage(
          userId,
          username,
          text
        );

        if (savedMessage && savedMessage.rateLimited) {
          socket.emit('chat:rate_limited', {
            message: 'You are sending messages too quickly',
          });
          return;
        }

        if (!savedMessage) {
          socket.emit('chat:error', { message: 'Failed to save message' });
          return;
        }

        // Broadcast new message to all connected clients
        nsp.to(globalRoom).emit('chat:new', {
          messageId: savedMessage.messageId,
          userId: savedMessage.userId,
          username: savedMessage.username,
          text: savedMessage.text,
          createdAt: savedMessage.createdAt,
        });
      } catch (error) {
        logger.error('Error sending chat message:', error);
        socket.emit('chat:error', { message: 'Failed to send message' });
      }
    });

    socket.on('chat:delete', async (data) => {
      try {
        const { messageId } = data;

        // Verify user is admin (implement proper role checking)
        // For now, allow any authenticated user to attempt
        const deletedMessage = await chatService.deleteChatMessage(
          messageId,
          userId
        );

        if (!deletedMessage) {
          socket.emit('chat:error', { message: 'Message not found' });
          return;
        }

        // Broadcast deletion
        nsp.to(globalRoom).emit('chat:deleted', { messageId });
      } catch (error) {
        logger.error('Error deleting message:', error);
        socket.emit('chat:error', { message: 'Failed to delete message' });
      }
    });

    socket.on('disconnect', () => {
      try {
        if (userId && userSocketMap.has(userId)) {
          const set = userSocketMap.get(userId);
          set.delete(socket.id);
          if (set.size === 0) userSocketMap.delete(userId);
        }

        const onlineCountAfter = (typeof userSocketMap.size === 'number' && userSocketMap.size >= 0)
          ? userSocketMap.size
          : ((nsp && nsp.sockets && typeof nsp.sockets.size === 'number')
            ? nsp.sockets.size
            : (io && io.engine && typeof io.engine.clientsCount === 'number' ? io.engine.clientsCount : 0));

        nsp.to(globalRoom).emit('chat:online', { count: Math.max(0, onlineCountAfter) });
      } catch (err) {
        logger.warn('Error handling chat disconnect:', err.message);
      }

      logger.debug(`User disconnected from /chat: ${userId}`);
    });
  });
}

/**
 * Start ready phase for a match
 * @param {Object} matchData - { matchId, playerIds, queueGroupId }
 * @param {Function} onTimeout - Callback for timeout
 * @returns {Promise<Object>} Ready session
 */
export async function startReadyPhaseMatch(matchData, onTimeout) {
  try {
    const { matchId, playerIds, queueGroupId } = matchData;

    // Create ready session with a shorter accept window (20s)
    const TIMEOUT_SECONDS = 20;
    const session = await readyService.startReadyPhase(
      matchId,
      playerIds,
      queueGroupId,
      TIMEOUT_SECONDS
    );

    // Emit init event to all players in the match room
    const stats = readyService.getSessionStats(session);
    matchNsp.to(`match-${matchId}`).emit('match:ready:init', {
      ...stats,
      secondsRemaining: TIMEOUT_SECONDS,
    });

    // Setup timeout handler: on timeout remove non-acceptors from the originating queue
    readyService.initializeReadyTimeout(matchId, TIMEOUT_SECONDS, async (result) => {
      // Emit timeout event
      matchNsp.to(`match-${matchId}`).emit('match:ready:timeout', {
        matchId: result.matchId,
        nonAcceptors: result.nonAcceptors,
        acceptors: result.acceptors,
      });

      // If we have a linked queueGroupId, process the queue: remove non-acceptors and keep acceptors with priority
      if (result && result.queueGroupId) {
        try {
          const queue = await Queue.findById(result.queueGroupId);
          if (queue) {
            const acceptedSet = new Set(result.acceptors || []);

            // Only consider players that were part of this ready session
            const sessionPlayerIds = new Set((result.acceptors || []).concat(result.nonAcceptors || []));

            // Preserve original order for accepted players, and keep all other non-session players after them
            const acceptedPlayersInQueue = queue.players.filter(p => sessionPlayerIds.has(p.steamId) && acceptedSet.has(p.steamId)).map(p => {
              p.hasPriority = true;
              return p;
            });

            const nonSessionPlayers = queue.players.filter(p => !sessionPlayerIds.has(p.steamId));

            // Build new players list: accepted first (in their original queue order), then everyone else who wasn't in the session
            const newPlayers = acceptedPlayersInQueue.concat(nonSessionPlayers);

            // Compute which session players were removed (non-acceptors)
            const removedSteamIds = Array.from(sessionPlayerIds).filter(id => !acceptedSet.has(id));

            queue.players = newPlayers;

            if (removedSteamIds.length > 0) {
              await User.updateMany({ steamId: { $in: removedSteamIds } }, { $set: { inQueue: false } });
              logger.info(`Removed ${removedSteamIds.length} non-acceptors from queue ${queue._id}`);
            }

            // Recalculate positions
            queue.players.forEach((player, index) => {
              player.position = index + 1;
            });

            // Reset accept phase fields
            queue.acceptPhase.active = false;
            queue.acceptPhase.startedAt = null;
            queue.acceptPhase.expiresAt = null;
            queue.acceptPhase.acceptedPlayers = [];
            queue.acceptPhase.declinedPlayers = [];

            // Update queue status
            queue.status = (queue.players.length >= queue.requiredPlayers) ? 'full' : 'waiting';

            await queue.save();

            // Broadcast updated queue state
            io.to('queue').emit('queue:update', { players: queue.players, status: queue.status });
          }
        } catch (err) {
          logger.error('Error processing accept phase results on timeout:', err);
        }
      }

      // Trigger external callback if provided
      if (onTimeout) {
        onTimeout(result);
      }
    });

    return session;
  } catch (error) {
    logger.error(`Failed to start ready phase match: ${error.message}`, error);
    throw error;
  }
}

/**
 * Get ready session stats
 * @param {string} matchId - Match identifier
 * @returns {Promise<Object|null>} Session stats or null
 */
async function getReadySessionStats(matchId) {
  try {
    const session = await ReadySession.findOne({
      matchId,
      status: 'active',
    }).lean();

    return session ? readyService.getSessionStats(session) : null;
  } catch (error) {
    logger.error('Error getting ready session stats:', error);
    return null;
  }
}

/**
 * Get Socket.IO server instance
 * @returns {Server|null} Socket.IO server
 */
export function getIO() {
  return io;
}

/**
 * Get /match namespace
 * @returns {Namespace|null} Match namespace
 */
export function getMatchNamespace() {
  return matchNsp;
}

/**
 * Get /chat namespace
 * @returns {Namespace|null} Chat namespace
 */
export function getChatNamespace() {
  return chatNsp;
}

/**
 * Cleanup and shutdown Socket.IO
 */
export async function shutdownSockets() {
  try {
    if (io) {
      io.close();
      logger.info('Socket.IO server shutdown');
    }
  } catch (error) {
    logger.error(`Error shutting down sockets: ${error.message}`);
  }
}
