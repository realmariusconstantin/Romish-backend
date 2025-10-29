/**
 * MATCH ACCEPT CONTROLLER
 * ========================
 * Handles the accept/ready phase when a match is created
 * 
 * FLOW:
 * 1. Queue reaches 10 players → Match created with phase='accept'
 * 2. All 10 players receive 'match-ready' WebSocket event
 * 3. Each player clicks ACCEPT → POST /api/match/:matchId/accept
 * 4. Backend validates player is in match.acceptPhase.requiredPlayers
 * 5. Adds to match.acceptPhase.acceptedPlayers array
 * 6. Broadcasts 'player-accepted' event to all match participants
 * 7. When all 10 accept (or timeout), transitions to draft phase
 * 8. If timeout with <10 accepts, match cancelled, players return to queue
 */

import Match from '../models/match.model.js';
import Queue from '../models/queue.model.js';
import User from '../models/user.model.js';

/**
 * Accept match - player confirms they're ready
 * POST /api/match/:matchId/accept
 */
export const acceptMatch = async (req, res) => {
  try {
    const { matchId } = req.params;
    const { steamId, name } = req.user;
    
    console.log(`🎯 Accept request: ${name} (${steamId}) for match ${matchId}`);
    
    // Get match from database
    const match = await Match.findOne({ matchId });
    
    if (!match) {
      console.error(`❌ Match not found: ${matchId}`);
      return res.status(404).json({
        success: false,
        error: 'Match not found',
      });
    }
    
    // Validate match is in accept phase
    if (match.phase !== 'accept') {
      console.error(`❌ Match ${matchId} is not in accept phase (current: ${match.phase})`);
      return res.status(400).json({
        success: false,
        error: `Match is in ${match.phase} phase, not accept phase`,
      });
    }
    
    // Call match model's acceptMatch method (handles all validation)
    try {
      await match.acceptMatch(steamId);
      
      const acceptStatus = match.getAcceptStatus();
      
      console.log(`✅ ${name} accepted match ${matchId} (${acceptStatus.acceptedCount}/${acceptStatus.requiredCount})`);
      
      // Broadcast to all match participants via Socket.IO
      const io = req.app.get('io');
      if (io) {
        io.to(`match-${matchId}`).emit('player-accepted', {
          matchId,
          steamId,
          name,
          acceptedCount: acceptStatus.acceptedCount,
          requiredCount: acceptStatus.requiredCount,
          acceptedPlayers: acceptStatus.acceptedPlayers,
        });
      }
      
      // Check if all players have accepted
      if (match.allPlayersAccepted()) {
        console.log(`🎉 Match ${matchId}: All players accepted! Transitioning to draft phase...`);
        
        await match.endAcceptPhase();
        
        // Broadcast match start event to BOTH match room AND queue room
        if (io) {
          const matchStartPayload = {
            matchId,
            phase: 'draft',
            message: 'All players ready! Starting captain draft...',
          };
          
          console.log(`📡 Emitting match-starting to match-${matchId} and queue rooms`);
          io.to(`match-${matchId}`).emit('match-starting', matchStartPayload);
          io.to('queue').emit('match-starting', matchStartPayload);
        }
      }
      
      return res.json({
        success: true,
        message: 'Match accepted successfully',
        acceptStatus,
      });
      
    } catch (acceptError) {
      // Handle specific validation errors from match.acceptMatch()
      console.error(`❌ Accept validation failed: ${acceptError.message}`);
      
      return res.status(400).json({
        success: false,
        error: acceptError.message,
      });
    }
    
  } catch (error) {
    console.error('❌ Accept match error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to accept match',
      details: error.message,
    });
  }
};

/**
 * Get match accept status
 * GET /api/match/:matchId/accept/status
 */
export const getAcceptStatus = async (req, res) => {
  try {
    const { matchId } = req.params;
    
    const match = await Match.findOne({ matchId });
    
    if (!match) {
      return res.status(404).json({
        success: false,
        error: 'Match not found',
      });
    }
    
    const acceptStatus = match.getAcceptStatus();
    
    return res.json({
      success: true,
      matchId,
      phase: match.phase,
      acceptStatus,
    });
    
  } catch (error) {
    console.error('Get accept status error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get accept status',
    });
  }
};

/**
 * Process accept phase timeout
 * Called by setTimeout after match creation
 */
export const processAcceptTimeout = async (matchId) => {
  try {
    console.log(`⏰ Processing accept timeout for match ${matchId}`);
    
    const match = await Match.findOne({ matchId });
    
    if (!match) {
      console.error(`❌ Match ${matchId} not found during timeout processing`);
      return;
    }
    
    // Check if already processed
    if (!match.acceptPhase.active) {
      console.log(`⚠️ Match ${matchId} accept phase already ended`);
      return;
    }
    
    const acceptStatus = match.getAcceptStatus();
    
    console.log(`📊 Match ${matchId} timeout: ${acceptStatus.acceptedCount}/${acceptStatus.requiredCount} accepted`);
    
    // Get Socket.IO instance (global if available)
    const io = global.io;
    
    // If all players accepted, proceed to draft
    if (match.allPlayersAccepted()) {
      await match.endAcceptPhase();
      console.log(`✅ Match ${matchId} starting - all players accepted`);
      
      if (io) {
        io.to(`match-${matchId}`).emit('match-starting', {
          matchId,
          phase: 'draft',
          message: 'All players ready! Starting captain draft...',
        });
      }
      return;
    }
    
    // NOT all players accepted - cancel match and handle queue
    console.log(`❌ Match ${matchId} timed out - not all players accepted`);
    
    // Get acceptors and non-acceptors
    const acceptedSteamIds = match.acceptPhase.acceptedPlayers.map(p => p.steamId);
    const acceptors = match.acceptPhase.requiredPlayers.filter(
      p => acceptedSteamIds.includes(p.steamId)
    );
    const nonAcceptors = match.acceptPhase.requiredPlayers.filter(
      p => !acceptedSteamIds.includes(p.steamId)
    );
    
    console.log(`   ✅ Acceptors (${acceptors.length}): ${acceptors.map(p => p.name).join(', ')}`);
    console.log(`   ❌ Non-acceptors (${nonAcceptors.length}): ${nonAcceptors.map(p => p.name).join(', ')}`);
    
    // Cancel the match
    await match.endAcceptPhase(); // This will set phase to 'cancelled'
    
    // Clear currentMatch for all players in this match
    await User.updateMany(
      { steamId: { $in: match.acceptPhase.requiredPlayers.map(p => p.steamId) } },
      { currentMatch: null }
    );
    
    // Get or create active queue
    let queue = await Queue.getActiveQueue();
    if (!queue) {
      queue = await Queue.create({ players: [], status: 'waiting' });
    }
    
    // Add acceptors back to queue with priority
    console.log(`🔄 Re-adding ${acceptors.length} acceptors to queue with priority`);
    for (const player of acceptors) {
      // Check if not already in queue
      const alreadyInQueue = queue.players.some(p => p.steamId === player.steamId);
      if (!alreadyInQueue) {
        await queue.addPlayer({
          steamId: player.steamId,
          name: player.name,
          avatar: '', // Will be filled from user doc
        }, true); // true = priority (front of queue)
        
        // Update user status
        await User.updateOne(
          { steamId: player.steamId },
          { inQueue: true, currentMatch: null }
        );
      }
    }
    
    console.log(`✅ Queue now has ${queue.players.length} players`);
    
    // Notify all match participants about cancellation
    if (io) {
      io.to(`match-${matchId}`).emit('match-cancelled', {
        matchId,
        reason: 'Not all players accepted in time',
        acceptedCount: acceptors.length,
        requiredCount: match.acceptPhase.requiredPlayers.length,
        nonAcceptors: nonAcceptors.map(p => p.steamId),
      });
      
      // Emit queue update
      io.to('queue').emit('queue:updated', {
        players: queue.players,
        count: queue.players.length,
        required: queue.requiredPlayers,
        status: queue.status,
      });
    }
    
  } catch (error) {
    console.error(`❌ Error processing accept timeout for match ${matchId}:`, error);
  }
};
