import * as readyService from '../ready/ready.socket.js';
import { getMatchNamespace, getIO } from '../sockets/index.js';
import { createMatchFromReadySession } from './queue.controller.js';

/**
 * HTTP endpoint to accept a provisional ready session (PEND- match)
 * POST /api/queue/ready/:matchId/accept
 */
export const acceptReady = async (req, res) => {
  try {
    const { matchId } = req.params;
    const userId = req.user?.userId || req.user?.steamId || (req.user?._id && req.user._id.toString());

    if (!matchId) {
      return res.status(400).json({ success: false, error: 'matchId required' });
    }

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const result = await readyService.recordPlayerAccept(matchId, userId);

    if (result.error) {
      return res.status(400).json({ success: false, error: result.error });
    }

    // Emit live update to sockets (if available) so frontend can update accept squares
    try {
      const matchNsp = getMatchNamespace();
      const io = getIO();
      if (matchNsp) {
        matchNsp.to(`match-${matchId}`).emit('match:ready:update', result.stats);
      } else if (io) {
        io.to(`match-${matchId}`).emit('match:ready:update', result.stats);
      }
    } catch (e) {
      console.warn('Could not emit ready update via sockets:', e && e.message);
    }

    // If all accepted, complete ready phase and create the real Match, then notify clients
    try {
      const allAccepted = await readyService.checkAllAccepted(matchId);
      if (allAccepted) {
        await readyService.completeReadyPhase(matchId, 'draft');
        const createdMatch = await createMatchFromReadySession(matchId, getIO());
        try {
          const matchNsp = getMatchNamespace();
          if (matchNsp) {
            matchNsp.to(`match-${matchId}`).emit('match:ready:complete', {
              provisionalMatchId: matchId,
              matchId: createdMatch ? createdMatch.matchId : matchId,
              nextPhase: 'draft',
            });
            // Also notify new match room
            if (createdMatch) {
              matchNsp.to(`match-${createdMatch.matchId}`).emit('match:ready:complete', {
                provisionalMatchId: matchId,
                matchId: createdMatch.matchId,
                nextPhase: 'draft',
              });
            }
          }
          if (getIO()) {
            getIO().to('queue').emit('match-starting', {
              matchId: createdMatch ? createdMatch.matchId : matchId,
              phase: 'draft',
              message: 'Match starting',
            });
          }
        } catch (e) {
          console.warn('Could not emit match creation events:', e && e.message);
        }
      }
    } catch (e) {
      console.warn('Error checking/completing all-accepted flow:', e && e.message);
    }

    return res.json({ success: true, stats: result.stats });
  } catch (error) {
    console.error('HTTP ready accept error:', error);
    return res.status(500).json({ success: false, error: 'Failed to accept ready session' });
  }
};

/**
 * HTTP endpoint to get ready session stats (optional)
 * GET /api/queue/ready/:matchId/status
 */
export const getReadyStatus = async (req, res) => {
  try {
    const { matchId } = req.params;
    if (!matchId) return res.status(400).json({ success: false, error: 'matchId required' });

    const session = await readyService.getActiveSessions();
    // find session by matchId
    const stats = session.find(s => s.matchId === matchId);
    if (!stats) return res.status(404).json({ success: false, error: 'Session not found' });
    return res.json({ success: true, stats });
  } catch (error) {
    console.error('Get ready status error:', error);
    return res.status(500).json({ success: false, error: 'Failed to get ready status' });
  }
};

/**
 * GET /api/queue/ready/mine
 * Return the active ReadySession that includes the authenticated user
 */
export const getMyReadySession = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.steamId || (req.user?._id && req.user._id.toString());
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const sessions = await readyService.getActiveSessions();
    const mySession = sessions.find(s => (s.players || []).some(p => p.userId === userId));
    if (!mySession) return res.status(404).json({ success: false, error: 'No active ready session for user' });

    return res.json({ success: true, session: mySession });
  } catch (error) {
    console.error('Get my ready session error:', error);
    return res.status(500).json({ success: false, error: 'Failed to get my ready session' });
  }
};
