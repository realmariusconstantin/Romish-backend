import Queue from '../models/queue.model.js';
import Match from '../models/match.model.js';
import User from '../models/user.model.js';
import config from '../config/env.js';
import featureFlags from '../utils/featureFlags.js';
import { notifyQueueFull } from '../utils/discordApi.js';
import {
  emitQueueUpdate,
  emitPlayerJoined,
  emitPlayerLeft,
  emitQueueFull,
} from '../utils/socketEvents.js';
import { autoPickForTestPlayers } from '../utils/autoPickForTestPlayers.js';
import { startMatchServer } from '../utils/serverProvisioning.js';
import { processAcceptTimeout } from './match-accept.controller.js';
import ReadySession from '../models/readySession.model.js';
import * as readyService from '../ready/ready.socket.js';

/**
 * FLOW STEP 1: Join the Queue
 * ============================
 * When a user clicks "Join Queue" on the frontend:
 * 1. Frontend sends POST /api/queue/join with auth cookie
 * 2. Backend validates user (authenticate middleware)
 * 3. Backend checks Discord verification (requireDiscordVerification middleware)
 * 4. Backend checks if user can join (canJoinQueue middleware - no active match, not banned)
 * 5. Backend adds user to queue or creates new queue if none exists
 * 6. When queue reaches 10 players, triggers Accept Phase (see below)
 */
export const joinQueue = async (req, res) => {
  try {
    // req.user is populated by authenticate middleware
    const { steamId, name, avatar } = req.user;

    // Get the current active queue, or create a new one
    let queue = await Queue.getActiveQueue();

    if (!queue) {
      queue = await Queue.create({
        players: [],
        status: 'waiting',
      });
    }

    // Prevent duplicate joins
    const existingPlayer = queue.players.find((p) => p.steamId === steamId);
    if (existingPlayer) {
      return res.status(400).json({
        success: false,
        error: 'Already in queue',
      });
    }

    // Add player to queue (assigns position, sets priority if applicable)
    await queue.addPlayer({ steamId, name, avatar });

    // Mark user as in queue in their User document
    req.user.inQueue = true;
    await req.user.save();

    // Broadcast to all connected clients that a player joined
    const io = req.app.get('io');
    if (io) {
      emitPlayerJoined(io, { steamId, name, avatar }, queue.players.length);
    }

    /**
     * FLOW STEP 2: Queue Full - Create Match with Accept Phase
     * =========================================================
     * When the 10th player joins:
     * 1. Create Match document in 'accept' phase
     * 2. Set up accept phase timeout handler
     * 3. Emit 'match-ready' event to all players
     * 4. Frontend shows AcceptMatchPopup component
     * 5. Players must click ACCEPT within timeout period
     * 6. After timeout OR all 10 accept, match transitions to draft or cancels
     */
    if (queue.isFull()) {
      console.log('🎯 Queue full! Creating match with accept phase...');
      
      queue.status = 'processing';
      await queue.save();
      
      // Start a ready/accept session separately from creating the Match
      // Build playerIds (use steamId or user._id string depending on ReadySession schema)
      const playerIds = queue.players.map(p => p.steamId || p.userId || p.steamId);

      // Create a provisional matchId for the ready session
      const provisionalMatchId = `PEND-${Date.now()}`;

      // Start ready phase (stores session in DB and sets TTL)
      const readySession = await readyService.startReadyPhase(
        provisionalMatchId,
        playerIds,
        queue._id.toString(),
        Math.floor((queue.acceptPhase && queue.acceptPhase.timeout) ? queue.acceptPhase.timeout / 1000 : 20)
      );

      console.log(`📡 Emitting match-ready event for provisional match ${provisionalMatchId}`);

      // Broadcast match-ready to all clients (clients will display Accept modal)
      if (io) {
        io.to('queue').emit('match-ready', {
          matchId: provisionalMatchId,
          expiresAt: readySession.expiresAt,
          timeout: Math.floor((readySession.expiresAt - Date.now()) / 1000) * 1000,
          requiredPlayers: readySession.players.map(p => ({ steamId: p.userId })),
          message: 'Match found! Click ACCEPT to continue.',
        });
      }
      
      // Mark queue as completed
      queue.status = 'completed';
      await queue.save();
      
      // Send Discord notification
      await notifyQueueFull(queue.players);
      
      // Return early with match info
      return res.json({
        success: true,
        message: 'Queue full - match created!',
        matchId: provisionalMatchId,
        redirectTo: `/draft/${provisionalMatchId}`,
        queue: {
          players: [],
          status: 'completed',
          required: queue.requiredPlayers,
        },
      });
    }
    
    // If queue is NOT full yet, just return normal queue status
    return res.json({
      success: true,
      message: 'Joined queue successfully',
      queue: {
        players: queue.players.map(p => ({
          steamId: p.steamId,
          name: p.name,
          avatar: p.avatar,
          joinedAt: p.joinedAt,
        })),
        status: queue.status,
        required: queue.requiredPlayers,
      },
    });
  } catch (error) {
    console.error('Join queue error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to join queue',
    });
  }
};

/**
 * FLOW STEP 3: Leave the Queue
 * ============================
 * POST /api/queue/leave
 */
export const leaveQueue = async (req, res) => {
  try {
    const { steamId } = req.user;

    // Get active queue
    const queue = await Queue.getActiveQueue();

    if (!queue) {
      return res.status(404).json({
        success: false,
        error: 'No active queue found',
      });
    }

    // Check if in queue
    const playerExists = queue.players.some((p) => p.steamId === steamId);
    if (!playerExists) {
      return res.status(400).json({
        success: false,
        error: 'Not in queue',
      });
    }

    // Remove player
    await queue.removePlayer(steamId);

    // Update user status
    req.user.inQueue = false;
    await req.user.save();

    // Emit Socket.IO event
    const io = req.app.get('io');
    if (io) {
      emitPlayerLeft(io, steamId, queue.players.length);
    }

    res.json({
      success: true,
      message: 'Left queue successfully',
      queue: {
        players: queue.players,
        count: queue.players.length,
        required: queue.requiredPlayers,
      },
    });
  } catch (error) {
    console.error('Leave queue error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to leave queue',
    });
  }
};

/**
 * Get current queue status
 */
export const getQueueStatus = async (req, res) => {
  try {
    const queue = await Queue.getActiveQueue();

    if (!queue) {
      return res.json({
        success: true,
        queue: {
          players: [],
          count: 0,
          required: 10,
          status: 'waiting',
        },
      });
    }

    res.json({
      success: true,
      queue: {
        players: queue.players,
        count: queue.players.length,
        required: queue.requiredPlayers,
        status: queue.status,
      },
    });
  } catch (error) {
    console.error('Get queue status error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get queue status',
    });
  }
};

/**
 * FLOW STEP 2.5: Accept Match (Player Clicks ACCEPT Button)
 * ==========================================================
 * When a player clicks ACCEPT in the popup:
 * 1. Frontend sends POST /api/queue/accept with auth cookie
 * 2. Backend validates authentication (THIS IS WHERE IT FAILS FOR NON-LOGGED-IN USERS)
 * 3. Backend checks if player is in the queue
 * 4. Backend adds player's steamId to acceptedPlayers array
 * 5. Broadcasts 'player-accepted' event to all clients
 * 6. If all 10 accept immediately, creates match without waiting for timeout
 * 
 * CRITICAL: User MUST be logged in (have valid JWT cookie) for this to work
 */
export const acceptMatch = async (req, res) => {
  try {
    // req.user is populated by authenticate middleware
    // If no valid cookie, middleware returns 401 before reaching here
    const { steamId } = req.user;
    
    // Get the current active queue
    const queue = await Queue.getActiveQueue();
    
    if (!queue) {
      return res.status(404).json({
        success: false,
        error: 'No active queue found',
      });
    }
    
    // Call queue model's acceptMatch method (validates player is in queue, accept phase active, etc.)
    await queue.acceptMatch(steamId);
    
    console.log(`✅ Player ${req.user.name} accepted the match (${queue.acceptPhase.acceptedPlayers.length}/10)`);
    
    // Broadcast to all clients that this player accepted
    const io = req.app.get('io');
    if (io) {
      io.to('queue').emit('player-accepted', {
        steamId,
        name: req.user.name,
        acceptedCount: queue.acceptPhase.acceptedPlayers.length,
        totalRequired: queue.requiredPlayers,
      });
    }
    
    /**
     * FLOW STEP 3: All Players Accepted Early
     * ========================================
     * If all 10 players accept before the timeout, immediately create match
     */
    if (queue.acceptPhase.acceptedPlayers.length === queue.requiredPlayers) {
      console.log('🎉 All players accepted! Creating match immediately...');
      
      queue.status = 'processing';
      await queue.save();
      
      // Process accept phase (gives priority to acceptors for future queues)
      await queue.processAcceptPhaseResults();
      
      // Create the match document
      const match = await createMatchFromQueue(queue, io);
      
      // Start Dathost server immediately
      console.log('🚀 Match created - starting Dathost server immediately...');
      startMatchServer()
        .then(result => {
          if (result.success) {
            console.log(`✅ Server ${result.serverId} started successfully`);
          } else {
            console.error(`❌ Failed to start server: ${result.error}`);
          }
        })
        .catch(err => {
          console.error('❌ Server start error:', err);
        });
      
      // Mark queue as completed
      queue.status = 'completed';
      await queue.save();
      
      // Send Discord notification
      await notifyQueueFull(queue.players);
      
      // Emit Socket.IO events
      if (io) {
        emitQueueFull(io, match.matchId);
        autoPickForTestPlayers(io, match.matchId);
      }
    }
    
    res.json({
      success: true,
      message: 'Match accepted!',
      acceptedCount: queue.acceptPhase.acceptedPlayers.length,
      totalRequired: queue.requiredPlayers,
    });
  } catch (error) {
    console.error('Accept match error:', error.message);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to accept match',
    });
  }
};

/**
 * Decline match during accept phase
 */
export const declineMatch = async (req, res) => {
  try {
    const { steamId } = req.user;
    
    // Get active queue
    const queue = await Queue.getActiveQueue();
    
    if (!queue) {
      return res.status(404).json({
        success: false,
        error: 'No active queue found',
      });
    }
    
    // Decline match
    await queue.declineMatch(steamId);
    
    console.log(`❌ Player ${req.user.name} declined the match`);
    
    // Update user status
    req.user.inQueue = false;
    await req.user.save();
    
    // Emit Socket.IO event
    const io = req.app.get('io');
    if (io) {
      io.to('queue').emit('player-declined', {
        steamId,
        name: req.user.name,
        declinedCount: queue.acceptPhase.declinedPlayers.length,
      });
    }
    
    res.json({
      success: true,
      message: 'Match declined. You have been removed from queue.',
    });
  } catch (error) {
    console.error('Decline match error:', error.message);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to decline match',
    });
  }
};

/**
 * Clear queue (admin only)
 */
export const clearQueue = async (req, res) => {
  try {
    const result = await Queue.clearQueue();

    // Update all users who were in queue
    await User.updateMany({ inQueue: true }, { inQueue: false });

    res.json({
      success: true,
      message: 'Queue cleared successfully',
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error('Clear queue error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to clear queue',
    });
  }
};

/**
 * Create match from full queue
 * Initializes match in 'accept' phase and sets up timeout
 */
async function createMatchFromQueue(queue, io) {
  const players = queue.players.map((p) => ({
    steamId: p.steamId,
    name: p.name,
    avatar: p.avatar,
  }));

  // Get captain-eligible players
  const eligiblePlayers = await User.find({
    steamId: { $in: players.map((p) => p.steamId) },
    isCaptainEligible: true,
  });

  let captainAlpha, captainBeta;

  if (eligiblePlayers.length >= 2) {
    // Randomly select 2 captains from eligible players
    const shuffled = eligiblePlayers.sort(() => Math.random() - 0.5);
    captainAlpha = shuffled[0].steamId;
    captainBeta = shuffled[1].steamId;
  } else if (eligiblePlayers.length === 1) {
    // One eligible captain, pick random for second
    captainAlpha = eligiblePlayers[0].steamId;
    const nonCaptains = players.filter((p) => p.steamId !== captainAlpha);
    captainBeta = nonCaptains[Math.floor(Math.random() * nonCaptains.length)].steamId;
  } else {
    // No eligible captains, pick 2 random players
    const shuffled = players.sort(() => Math.random() - 0.5);
    captainAlpha = shuffled[0].steamId;
    captainBeta = shuffled[1].steamId;
  }

  // Create match with accept phase initialized
  const match = await Match.createMatch(players, [captainAlpha, captainBeta]);
  
  console.log(`✅ Match ${match.matchId} created in accept phase`);
  console.log(`   Players: ${players.map(p => p.name).join(', ')}`);
  console.log(`   Timeout: ${match.acceptPhase.timeout}ms`);

  // Update all players with current match reference
  await User.updateMany(
    { steamId: { $in: players.map((p) => p.steamId) } },
    { currentMatch: match._id, inQueue: false }
  );

  // Increment captain count for selected captains
  await User.updateMany(
    { steamId: { $in: [captainAlpha, captainBeta] } },
    { $inc: { 'stats.captainCount': 1 } }
  );
  
  // Auto-accept for test players (players with steamId starting with 'test-')
  const testPlayers = players.filter(p => p.steamId.startsWith('test-'));
  if (testPlayers.length > 0) {
    console.log(`🤖 Auto-accepting ${testPlayers.length} test players...`);
    
    for (const testPlayer of testPlayers) {
      try {
        await match.acceptMatch(testPlayer.steamId);
        console.log(`   ✅ Auto-accepted: ${testPlayer.name}`);
        
        // Emit player-accepted event to BOTH rooms (match room and queue room)
        if (io) {
          const acceptStatus = match.getAcceptStatus();
          const eventPayload = {
            matchId: match.matchId,
            steamId: testPlayer.steamId,
            name: testPlayer.name,
            acceptedCount: acceptStatus.acceptedCount,
            requiredCount: acceptStatus.requiredCount,
            acceptedPlayers: acceptStatus.acceptedPlayers,
          };
          
          console.log(`   📡 Emitting player-accepted for ${testPlayer.name} (${acceptStatus.acceptedCount}/${acceptStatus.requiredCount})`);
          io.to(`match-${match.matchId}`).emit('player-accepted', eventPayload);
          io.to('queue').emit('player-accepted', eventPayload);
        }
      } catch (error) {
        console.error(`   ❌ Auto-accept failed for ${testPlayer.name}:`, error.message);
      }
    }
    
    // Check if all players accepted (all test players scenario)
    if (match.allPlayersAccepted()) {
      console.log(`🎉 Match ${match.matchId}: All test players accepted! Transitioning to draft phase...`);
      
      await match.endAcceptPhase();
      
      // Broadcast match start event
      if (io) {
        const matchStartPayload = {
          matchId: match.matchId,
          phase: 'draft',
          message: 'All players ready! Starting captain draft...',
        };
        
        console.log(`📡 Emitting match-starting to match-${match.matchId} and queue rooms`);
        io.to(`match-${match.matchId}`).emit('match-starting', matchStartPayload);
        io.to('queue').emit('match-starting', matchStartPayload);
      }
    }
  }
  
  // If configured to skip accept phase (development/testing), end it immediately
  if (featureFlags.skipAcceptPhase) {
    console.log(`⚡ SKIP_ACCEPT_PHASE enabled - ending accept phase for match ${match.matchId}`);
    try {
      await match.endAcceptPhase();

      // Broadcast match-starting immediately
      if (io) {
        const matchStartPayload = {
          matchId: match.matchId,
          phase: match.phase,
          message: 'Skipping accept phase - starting match immediately',
        };
        console.log(`📡 Emitting match-starting for match ${match.matchId} (skip accept)`);
        io.to(`match-${match.matchId}`).emit('match-starting', matchStartPayload);
        io.to('queue').emit('match-starting', matchStartPayload);
      }
    } catch (err) {
      console.error(`Failed to skip accept phase for match ${match.matchId}:`, err);
    }
  } else {
    // Set up accept phase timeout
    setTimeout(() => {
      // Ensure any rejection inside processAcceptTimeout is handled to avoid unhandledRejection
      processAcceptTimeout(match.matchId).catch(err => {
        console.error(`Error in processAcceptTimeout for ${match.matchId}:`, err);
      });
    }, match.acceptPhase.timeout);
    
    console.log(`⏰ Accept timeout scheduled for ${match.acceptPhase.timeout}ms`);
  }

  return match;
}

export default {
  joinQueue,
  leaveQueue,
  getQueueStatus,
  clearQueue,
};

/**
 * Create a Match document based on a completed ReadySession
 * @param {string} readyMatchId - The provisional matchId used by ReadySession
 * @param {Object} io - Socket.IO server instance
 */
export async function createMatchFromReadySession(readyMatchId, io) {
  try {
    // Find the ready session
    const session = await ReadySession.findOne({ matchId: readyMatchId }).lean();
    if (!session) {
      console.warn(`No ReadySession found for ${readyMatchId}`);
      return null;
    }

    const playerIds = session.players.map(p => p.userId);

    // Fetch user docs - support both steamId and Mongo _id
    const users = await User.find({
      $or: [
        { steamId: { $in: playerIds } },
        { _id: { $in: playerIds.filter(id => /^[0-9a-fA-F]{24}$/.test(id)) } }
      ]
    }).lean();

    // Map to players expected by Match.createMatch
    const players = playerIds.map(id => {
      const u = users.find(x => x.steamId === id || (x._id && x._id.toString() === id));
      if (u) {
        return { steamId: u.steamId, name: u.name, avatar: u.avatar };
      }
      // Fallback - unknown user
      return { steamId: id, name: `Player ${id}`, avatar: '' };
    });

    // Choose captains (similar to existing logic)
    const eligiblePlayers = await User.find({ steamId: { $in: players.map(p => p.steamId) }, isCaptainEligible: true }).lean();

    let captainAlpha, captainBeta;
    if (eligiblePlayers.length >= 2) {
      const shuffled = eligiblePlayers.sort(() => Math.random() - 0.5);
      captainAlpha = shuffled[0].steamId;
      captainBeta = shuffled[1].steamId;
    } else if (eligiblePlayers.length === 1) {
      captainAlpha = eligiblePlayers[0].steamId;
      const nonCaptains = players.filter(p => p.steamId !== captainAlpha);
      captainBeta = nonCaptains[Math.floor(Math.random() * nonCaptains.length)].steamId;
    } else {
      const shuffled = players.sort(() => Math.random() - 0.5);
      captainAlpha = shuffled[0].steamId;
      captainBeta = shuffled[1].steamId;
    }

    // Create match
    const match = await Match.createMatch(players, [captainAlpha, captainBeta]);

    // Update user documents
    await User.updateMany({ steamId: { $in: players.map(p => p.steamId) } }, { currentMatch: match._id, inQueue: false });

    // Emit match-starting to match room and queue
    if (io) {
      const payload = { matchId: match.matchId, phase: 'draft', message: 'All players ready - starting match' };
      io.to(`match-${match.matchId}`).emit('match-starting', payload);
      io.to('queue').emit('match-starting', payload);
      // If there are test/sim players, start the auto-pick flow for draft
      try {
        autoPickForTestPlayers(io, match.matchId);
      } catch (e) {
        console.warn('autoPickForTestPlayers failed to start:', e && e.message);
      }
    }

    return match;
  } catch (error) {
    console.error('createMatchFromReadySession error:', error);
    return null;
  }
}
