import Match from '../models/match.model.js';

/**
 * Prevent player from navigating away from active match
 */
export const checkActiveMatch = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // Check if user has an active match
    if (req.user.currentMatch) {
      const match = await Match.findById(req.user.currentMatch);

      if (match && match.phase !== 'complete' && match.phase !== 'cancelled') {
        return res.status(403).json({
          success: false,
          error: 'Active match in progress',
          message: 'You cannot leave until the match is complete',
          match: {
            matchId: match.matchId,
            phase: match.phase,
          },
          redirectTo: `/match/${match.matchId}`,
        });
      }

      // Clear stale match reference
      if (match && (match.phase === 'complete' || match.phase === 'cancelled')) {
        req.user.currentMatch = null;
        req.user.inQueue = false;
        await req.user.save();
      }
    }

    next();
  } catch (error) {
    console.error('Match phase check error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to check match status',
    });
  }
};

/**
 * Verify player is in the specified match
 */
export const verifyMatchParticipant = async (req, res, next) => {
  try {
    const { matchId } = req.params;

    if (!matchId) {
      return res.status(400).json({
        success: false,
        error: 'Match ID required',
      });
    }

    const match = await Match.findOne({ matchId });

    if (!match) {
      return res.status(404).json({
        success: false,
        error: 'Match not found',
      });
    }

    // Check if user is in this match
    const isParticipant = match.players.some(
      (player) => player.steamId === req.steamId
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        error: 'You are not a participant in this match',
      });
    }

    // Attach match to request
    req.match = match;

    next();
  } catch (error) {
    console.error('Match participant verification error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to verify match participant',
    });
  }
};

/**
 * Verify user is captain in the match
 */
export const verifyCaptain = async (req, res, next) => {
  try {
    if (!req.match) {
      return res.status(400).json({
        success: false,
        error: 'Match not found in request',
      });
    }

    const isCaptain =
      req.match.captains.alpha === req.steamId ||
      req.match.captains.beta === req.steamId;

    if (!isCaptain) {
      return res.status(403).json({
        success: false,
        error: 'Only captains can perform this action',
      });
    }

    // Determine which team captain
    req.captainTeam =
      req.match.captains.alpha === req.steamId ? 'alpha' : 'beta';

    next();
  } catch (error) {
    console.error('Captain verification error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to verify captain status',
    });
  }
};

/**
 * Verify it's the captain's turn to pick/ban
 */
export const verifyTurn = (req, res, next) => {
  try {
    if (!req.match || !req.captainTeam) {
      return res.status(400).json({
        success: false,
        error: 'Match or captain data not found',
      });
    }

    const match = req.match;
    let currentTurn;

    if (match.phase === 'draft') {
      currentTurn = match.currentPicker;
    } else if (match.phase === 'veto') {
      currentTurn = match.currentVeto;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Match not in draft or veto phase',
      });
    }

    if (currentTurn !== req.captainTeam) {
      return res.status(403).json({
        success: false,
        error: 'Not your turn',
        currentTurn,
      });
    }

    next();
  } catch (error) {
    console.error('Turn verification error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to verify turn',
    });
  }
};

/**
 * Check if match is in specific phase
 */
export const requirePhase = (allowedPhases) => {
  return (req, res, next) => {
    if (!req.match) {
      return res.status(400).json({
        success: false,
        error: 'Match not found in request',
      });
    }

    const phases = Array.isArray(allowedPhases) ? allowedPhases : [allowedPhases];

    if (!phases.includes(req.match.phase)) {
      return res.status(400).json({
        success: false,
        error: `Match must be in ${phases.join(' or ')} phase`,
        currentPhase: req.match.phase,
      });
    }

    next();
  };
};

export default {
  checkActiveMatch,
  verifyMatchParticipant,
  verifyCaptain,
  verifyTurn,
  requirePhase,
};
