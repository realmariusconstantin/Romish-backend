import Match from '../models/match.model.js';
import User from '../models/user.model.js';
import { notifyMatchStart, notifyMatchComplete } from '../utils/discordApi.js';
import { createMatchServer, deleteMatchServer } from '../utils/dathostApi.js';
import { startMatchServer, provisionServer } from '../utils/serverProvisioning.js';
import {
  emitDraftUpdate,
  emitVetoUpdate,
  emitServerReady,
  emitMatchComplete,
  emitPhaseChange,
} from '../utils/socketEvents.js';
import { autoBanForTestPlayers } from '../utils/autoBanForTestPlayers.js';
import { enrichPlayersWithFaceit } from '../utils/faceitEnricher.js';

/**
 * Get current user's active match
 */
export const getCurrentMatch = async (req, res) => {
  try {
    if (!req.user.currentMatch) {
      return res.status(404).json({
        success: false,
        error: 'No active match found',
      });
    }

    const match = await Match.findById(req.user.currentMatch);

    if (!match) {
      // Clear stale reference
      req.user.currentMatch = null;
      await req.user.save();

      return res.status(404).json({
        success: false,
        error: 'Match not found',
      });
    }

    // Enrich players with FACEIT data
    const enrichedPlayers = await enrichPlayersWithFaceit(match.players);

    res.json({
      success: true,
      match: {
        matchId: match.matchId,
        phase: match.phase,
        players: enrichedPlayers,
        captains: match.captains,
        teams: match.teams,
        pickOrder: match.pickOrder,
        currentPicker: match.currentPicker,
        pickIndex: match.pickIndex,
        pickHistory: match.pickHistory,
        availableMaps: match.availableMaps,
        bannedMaps: match.bannedMaps,
        vetoOrder: match.vetoOrder,
        currentVeto: match.currentVeto,
        selectedMap: match.selectedMap,
        serverInfo: match.serverInfo,
        result: match.result,
        createdAt: match.createdAt,
      },
    });
  } catch (error) {
    console.error('Get current match error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get match',
    });
  }
};

/**
 * Get match by ID
 */
export const getMatchById = async (req, res) => {
  try {
    // Enrich players with FACEIT data
    const enrichedPlayers = await enrichPlayersWithFaceit(req.match.players);
    
    res.json({
      success: true,
      match: {
        matchId: req.match.matchId,
        phase: req.match.phase,
        players: enrichedPlayers,
        captains: req.match.captains,
        teams: req.match.teams,
        pickOrder: req.match.pickOrder,
        currentPicker: req.match.currentPicker,
        pickIndex: req.match.pickIndex,
        pickHistory: req.match.pickHistory,
        availableMaps: req.match.availableMaps,
        bannedMaps: req.match.bannedMaps,
        vetoOrder: req.match.vetoOrder,
        currentVeto: req.match.currentVeto,
        selectedMap: req.match.selectedMap,
        serverInfo: req.match.serverInfo,
        result: req.match.result,
        createdAt: req.match.createdAt,
      },
    });
  } catch (error) {
    console.error('Get match by ID error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get match',
    });
  }
};

/**
 * Pick a player during draft phase
 */
export const pickPlayer = async (req, res) => {
  try {
    const { steamId } = req.body;

    if (!steamId) {
      return res.status(400).json({
        success: false,
        error: 'Steam ID required',
      });
    }

    const match = req.match;

    // Verify player is in the match
    const player = match.players.find((p) => p.steamId === steamId);
    if (!player) {
      return res.status(400).json({
        success: false,
        error: 'Player not in match',
      });
    }

    // Verify player not already picked
    const alreadyPicked = 
      match.teams.alpha.some((p) => p.steamId === steamId) ||
      match.teams.beta.some((p) => p.steamId === steamId);

    if (alreadyPicked) {
      return res.status(400).json({
        success: false,
        error: 'Player already picked',
      });
    }

    // Pick player
    await match.pickPlayer(steamId, req.captainTeam);

    // Emit Socket.IO event
    const io = req.app.get('io');

    // Check if draft is complete
    if (match.phase === 'veto') {
      // Draft completed, moved to veto phase
      
      if (io) {
        emitPhaseChange(io, match, 'veto');
        emitVetoUpdate(io, match);
        
        // Start auto-ban for test players
        autoBanForTestPlayers(io, match.matchId);
      }

      res.json({
        success: true,
        message: 'Draft complete! Starting map veto.',
        match: {
          matchId: match.matchId,
          phase: match.phase,
          teams: match.teams,
          vetoOrder: match.vetoOrder,
          currentVeto: match.currentVeto,
          availableMaps: match.availableMaps,
        },
      });
    } else {
      if (io) {
        emitDraftUpdate(io, match);
      }

      res.json({
        success: true,
        message: 'Player picked successfully',
        match: {
          matchId: match.matchId,
          phase: match.phase,
          teams: match.teams,
          currentPicker: match.currentPicker,
          pickIndex: match.pickIndex,
          pickHistory: match.pickHistory,
        },
      });
    }
  } catch (error) {
    console.error('Pick player error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to pick player',
    });
  }
};

/**
 * Ban a map during veto phase
 */
export const banMap = async (req, res) => {
  try {
    const { mapName } = req.body;

    if (!mapName) {
      return res.status(400).json({
        success: false,
        error: 'Map name required',
      });
    }

    const match = req.match;

    // Verify map is available
    if (!match.availableMaps.includes(mapName)) {
      return res.status(400).json({
        success: false,
        error: 'Map not available or already banned',
      });
    }

    // Ban map
    await match.banMap(mapName, req.captainTeam);

    // Emit Socket.IO event
    const io = req.app.get('io');

    // Check if veto is complete (only 1 map left)
    if (match.phase === 'ready') {
      // Veto completed, transition to ready phase (loading screen)
      console.log('🎮 Veto complete - provisioning server with match configs...');
      
      // Emit phase change immediately so frontend shows loading screen
      if (io) {
        emitPhaseChange(io, match, 'ready');
      }

      // Provision server in background (upload configs + execute RCON)
      // This happens during the 5-second loading screen
      provisionServer(match)
        .then(async (provisionResult) => {
          if (provisionResult.success) {
            // Update match with server info and move to live phase
            match.serverInfo = {
              ip: provisionResult.serverInfo.ip,
              port: provisionResult.serverInfo.port,
              password: provisionResult.serverInfo.password,
              serverId: provisionResult.serverInfo.serverId,
              connectString: provisionResult.serverInfo.connectString,
            };
            match.phase = 'live';
            await match.save();

            console.log(`✅ Server provisioned successfully: ${provisionResult.serverInfo.connectString}`);

            // Send Discord notification
            await notifyMatchStart(match);

            // Emit Socket.IO events for live phase
            if (io) {
              emitPhaseChange(io, match, 'live');
              emitServerReady(io, match);
            }
          } else {
            console.error(`❌ Server provisioning failed: ${provisionResult.error}`);
            // Still transition to live but without server info
            match.phase = 'live';
            await match.save();
            
            if (io) {
              emitPhaseChange(io, match, 'live');
            }
          }
        })
        .catch(async (serverError) => {
          console.error('❌ Server provisioning error:', serverError.message);
          // Continue without server
          match.phase = 'live';
          await match.save();
          
          if (io) {
            emitPhaseChange(io, match, 'live');
          }
        });

      // Return immediately with ready phase
      return res.json({
        success: true,
        message: 'Veto complete! Server provisioning...',
        match: {
          matchId: match.matchId,
          phase: match.phase,
          selectedMap: match.selectedMap,
        },
      });
    }

    if (io) {
      emitVetoUpdate(io, match);
    }

    res.json({
      success: true,
      message: 'Map banned successfully',
      match: {
        matchId: match.matchId,
        phase: match.phase,
        availableMaps: match.availableMaps,
        bannedMaps: match.bannedMaps,
        currentVeto: match.currentVeto,
      },
    });
  } catch (error) {
    console.error('Ban map error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to ban map',
    });
  }
};

/**
 * Complete match with result
 */
export const completeMatch = async (req, res) => {
  try {
    const { winner, scoreAlpha, scoreBeta } = req.body;

    if (!winner || !['alpha', 'beta', 'tie'].includes(winner)) {
      return res.status(400).json({
        success: false,
        error: 'Valid winner required (alpha, beta, or tie)',
      });
    }

    const match = req.match;

    // Complete match
    await match.completeMatch(winner, {
      alpha: scoreAlpha || 0,
      beta: scoreBeta || 0,
    });

    // Update player stats
    const winnerTeam = winner === 'tie' ? null : match.teams[winner];
    const loserTeam = winner === 'tie' ? null : match.teams[winner === 'alpha' ? 'beta' : 'alpha'];

    if (winnerTeam && loserTeam) {
      // Update winners
      await User.updateMany(
        { steamId: { $in: winnerTeam.map((p) => p.steamId) } },
        { 
          currentMatch: null,
          $inc: { 'stats.matchesPlayed': 1 }
        }
      );
      
      for (const player of winnerTeam) {
        const user = await User.findOne({ steamId: player.steamId });
        if (user) {
          await user.updateStats(true);
        }
      }

      // Update losers
      await User.updateMany(
        { steamId: { $in: loserTeam.map((p) => p.steamId) } },
        { 
          currentMatch: null,
          $inc: { 'stats.matchesPlayed': 1 }
        }
      );
      
      for (const player of loserTeam) {
        const user = await User.findOne({ steamId: player.steamId });
        if (user) {
          await user.updateStats(false);
        }
      }
    } else {
      // Tie - just clear match reference
      await User.updateMany(
        { steamId: { $in: match.players.map((p) => p.steamId) } },
        { 
          currentMatch: null,
          $inc: { 'stats.matchesPlayed': 1 }
        }
      );
    }

    // Delete server if exists
    if (match.serverInfo?.serverId) {
      try {
        await deleteMatchServer(match.serverInfo.serverId);
      } catch (error) {
        console.error('Server deletion error:', error.message);
      }
    }

    // Send Discord notification
    await notifyMatchComplete(match);

    // Emit Socket.IO event
    const io = req.app.get('io');
    if (io) {
      emitMatchComplete(io, match);
    }

    res.json({
      success: true,
      message: 'Match completed successfully',
      match: {
        matchId: match.matchId,
        phase: match.phase,
        result: match.result,
      },
    });
  } catch (error) {
    console.error('Complete match error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to complete match',
    });
  }
};

/**
 * Cancel match (admin only)
 */
export const cancelMatch = async (req, res) => {
  try {
    const match = req.match;

    // Clear match reference from all players BEFORE deleting
    await User.updateMany(
      { steamId: { $in: match.players.map((p) => p.steamId) } },
      { currentMatch: null, inQueue: false }
    );

    // Delete server if exists
    if (match.serverInfo?.serverId) {
      try {
        await deleteMatchServer(match.serverInfo.serverId);
      } catch (error) {
        console.error('Server deletion error:', error.message);
      }
    }

    const matchId = match.matchId;
    
    // DELETE the match instead of setting to cancelled
    await Match.deleteOne({ matchId });

    res.json({
      success: true,
      message: 'Match cancelled and deleted successfully',
      matchId,
    });
  } catch (error) {
    console.error('Cancel match error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel match',
    });
  }
};

/**
 * Get server info for live match
 */
export const getServerInfo = async (req, res) => {
  try {
    const match = req.match;

    if (match.phase !== 'live' && match.phase !== 'complete') {
      return res.status(400).json({
        success: false,
        error: 'Server info only available for live matches',
      });
    }

    if (!match.serverInfo || !match.serverInfo.ip) {
      return res.status(404).json({
        success: false,
        error: 'Server info not available',
      });
    }

    res.json({
      success: true,
      server: {
        ip: match.serverInfo.ip,
        password: match.serverInfo.password,
        map: match.selectedMap,
        connectString: `connect ${match.serverInfo.ip}; password ${match.serverInfo.password}`,
      },
    });
  } catch (error) {
    console.error('Get server info error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get server info',
    });
  }
};

/**
 * ADMIN CONTROLS
 */

/**
 * Get all matches
 */
export const adminGetAllMatches = async (req, res) => {
  try {
    const { phase, limit = 50 } = req.query;
    
    const query = phase ? { phase } : {};
    const matches = await Match.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      matches,
      count: matches.length,
    });
  } catch (error) {
    console.error('Admin get all matches error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get matches',
    });
  }
};

/**
 * Remove a player from a match
 */
export const adminRemovePlayerFromMatch = async (req, res) => {
  try {
    const { matchId } = req.params;
    const { steamId } = req.body;

    if (!steamId) {
      return res.status(400).json({
        success: false,
        error: 'Steam ID required',
      });
    }

    const match = await Match.findOne({ matchId });
    if (!match) {
      return res.status(404).json({
        success: false,
        error: 'Match not found',
      });
    }

    // Remove player from match
    match.players = match.players.filter(p => p.steamId !== steamId);
    
    // Remove from teams if assigned
    if (match.teams?.alpha) {
      match.teams.alpha = match.teams.alpha.filter(p => p.steamId !== steamId);
    }
    if (match.teams?.beta) {
      match.teams.beta = match.teams.beta.filter(p => p.steamId !== steamId);
    }

    // If they were captain, remove captain assignment
    if (match.captains?.alpha === steamId) {
      match.captains.alpha = null;
    }
    if (match.captains?.beta === steamId) {
      match.captains.beta = null;
    }

    await match.save();

    // Clear user's match state
    const user = await User.findOne({ steamId });
    if (user) {
      user.currentMatch = null;
      user.inQueue = false;
      await user.save();
    }

    res.json({
      success: true,
      message: `Removed player ${steamId} from match ${matchId}`,
      match,
    });
  } catch (error) {
    console.error('Admin remove player error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to remove player from match',
    });
  }
};

/**
 * Clear user's match/queue state
 */
export const adminClearUserMatchState = async (req, res) => {
  try {
    const { steamId } = req.body;

    if (!steamId) {
      return res.status(400).json({
        success: false,
        error: 'Steam ID required',
      });
    }

    const user = await User.findOne({ steamId });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const oldState = {
      currentMatch: user.currentMatch,
      inQueue: user.inQueue,
    };

    user.currentMatch = null;
    user.inQueue = false;
    await user.save();

    res.json({
      success: true,
      message: `Cleared state for user ${user.name}`,
      oldState,
      newState: {
        currentMatch: null,
        inQueue: false,
      },
    });
  } catch (error) {
    console.error('Admin clear user state error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to clear user state',
    });
  }
};

/**
 * Force complete a match
 */
export const adminForceCompleteMatch = async (req, res) => {
  try {
    const { matchId } = req.params;
    const { winner } = req.body; // 'alpha' or 'beta'

    const match = await Match.findOne({ matchId });
    if (!match) {
      return res.status(404).json({
        success: false,
        error: 'Match not found',
      });
    }

    match.phase = 'completed';
    match.winner = winner || null;
    match.completedAt = new Date();
    await match.save();

    // Clear all players' currentMatch
    const playerSteamIds = match.players.map(p => p.steamId);
    await User.updateMany(
      { steamId: { $in: playerSteamIds } },
      { $set: { currentMatch: null, inQueue: false } }
    );

    // Emit match complete event
    emitMatchComplete(match.matchId, {
      winner,
      phase: 'completed',
    });

    res.json({
      success: true,
      message: `Force completed match ${matchId}`,
      match,
    });
  } catch (error) {
    console.error('Admin force complete match error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to force complete match',
    });
  }
};

/**
 * Delete a single match (admin)
 */
export const adminDeleteMatch = async (req, res) => {
  try {
    const { matchId } = req.params;

    const match = await Match.findOne({ matchId });
    if (!match) {
      return res.status(404).json({
        success: false,
        error: 'Match not found',
      });
    }

    // Clear all players' currentMatch references
    const playerSteamIds = match.players.map(p => p.steamId);
    await User.updateMany(
      { steamId: { $in: playerSteamIds } },
      { $set: { currentMatch: null, inQueue: false } }
    );

    // Delete server if exists
    if (match.serverInfo?.serverId) {
      try {
        await deleteMatchServer(match.serverInfo.serverId);
      } catch (error) {
        console.error('Server deletion error:', error.message);
      }
    }

    // Delete the match
    await Match.deleteOne({ matchId });

    res.json({
      success: true,
      message: `Deleted match ${matchId}`,
      matchId,
    });
  } catch (error) {
    console.error('Admin delete match error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to delete match',
    });
  }
};

/**
 * Mass delete all matches (admin)
 */
export const adminDeleteAllMatches = async (req, res) => {
  try {
    // Get all matches
    const matches = await Match.find({});

    // Clear all users' currentMatch references
    await User.updateMany(
      {},
      { $set: { currentMatch: null, inQueue: false } }
    );

    // Delete all servers (if any exist)
    for (const match of matches) {
      if (match.serverInfo?.serverId) {
        try {
          await deleteMatchServer(match.serverInfo.serverId);
        } catch (error) {
          console.error(`Server deletion error for ${match.matchId}:`, error.message);
        }
      }
    }

    // Delete all matches
    const result = await Match.deleteMany({});

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} matches`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error('Admin mass delete matches error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to delete all matches',
    });
  }
};

export default {
  getCurrentMatch,
  getMatchById,
  pickPlayer,
  banMap,
  completeMatch,
  cancelMatch,
  getServerInfo,
  adminGetAllMatches,
  adminRemovePlayerFromMatch,
  adminClearUserMatchState,
  adminForceCompleteMatch,
  adminDeleteMatch,
  adminDeleteAllMatches,
};
