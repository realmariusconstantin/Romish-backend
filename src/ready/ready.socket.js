/**
 * Ready Socket Module - Handles accept/ready-up phase for matches
 * @module ready.socket
 */

import ReadySession from '../models/readySession.model.js';
import logger from '../utils/logger.js';

/**
 * Start ready phase for a match
 * @param {string} matchId - Unique match identifier
 * @param {string[]} playerIds - Array of 10 player IDs
 * @param {string} queueGroupId - Queue group ID for reference
 * @param {number} timeoutSeconds - Timeout in seconds (default 60)
 * @returns {Promise<Object>} Ready session object
 */
export async function startReadyPhase(
  matchId,
  playerIds,
  queueGroupId,
  timeoutSeconds = 20
) {
  try {
    if (!matchId || !playerIds || playerIds.length !== 10) {
      throw new Error('Invalid matchId or playerIds must have exactly 10 players');
    }

    const expiresAt = new Date(Date.now() + timeoutSeconds * 1000);

    // Create ready session with TTL
    const readySession = new ReadySession({
      matchId,
      queueGroupId,
      playerIds,
      players: playerIds.map((userId) => ({
        userId,
        accepted: false,
        acceptedAt: null,
      })),
      expiresAt,
      status: 'active',
    });

    await readySession.save();

    logger.info(
      `Ready phase started: { matchId: ${matchId}, playerCount: 10, expiresAt: ${expiresAt} }`
    );

    return readySession;
  } catch (error) {
    logger.error(`Failed to start ready phase: ${error.message}`, {
      matchId,
      error: error.stack,
    });
    throw error;
  }
}

/**
 * Record player acceptance
 * @param {string} matchId - Match identifier
 * @param {string} userId - User who accepted
 * @returns {Promise<Object>} Updated ready session and stats
 */
export async function recordPlayerAccept(matchId, userId) {
  try {
    const session = await ReadySession.findOne({
      matchId,
      status: 'active',
    });

    if (!session) {
      logger.warn(`No active ready session found for matchId: ${matchId}`);
      return { error: 'Session not found or expired' };
    }

    // Check if user is in this session
    const playerIndex = session.players.findIndex((p) => p.userId === userId);
    if (playerIndex === -1) {
      logger.warn(
        `User ${userId} not in ready session for matchId: ${matchId}`
      );
      return { error: 'User not in session' };
    }

    // Prevent duplicate accepts
    if (session.players[playerIndex].accepted) {
      logger.info(
        `Duplicate accept ignored: { matchId: ${matchId}, userId: ${userId} }`
      );
      return { stats: getSessionStats(session) };
    }

    // Record acceptance
    session.players[playerIndex].accepted = true;
    session.players[playerIndex].acceptedAt = new Date();
    await session.save();

    logger.info(
      `Player accepted: { matchId: ${matchId}, userId: ${userId} }`
    );

    return { stats: getSessionStats(session) };
  } catch (error) {
    logger.error(`Failed to record player accept: ${error.message}`, {
      matchId,
      userId,
      error: error.stack,
    });
    throw error;
  }
}

/**
 * Check if all players have accepted
 * @param {string} matchId - Match identifier
 * @returns {Promise<boolean>} True if all accepted
 */
export async function checkAllAccepted(matchId) {
  try {
    const session = await ReadySession.findOne({
      matchId,
      status: 'active',
    }).lean();

    if (!session) return false;

    const allAccepted = session.players.every((p) => p.accepted);
    return allAccepted;
  } catch (error) {
    logger.error(`Failed to check all accepted: ${error.message}`, { matchId });
    return false;
  }
}

/**
 * Get current session stats
 * @param {Object} session - Ready session
 * @returns {Object} Stats object
 */
export function getSessionStats(session) {
  const acceptedCount = session.players.filter((p) => p.accepted).length;
  return {
    matchId: session.matchId,
    totalPlayers: session.players.length,
    acceptedCount,
    pendingCount: session.players.length - acceptedCount,
    players: session.players.map((p) => ({
      userId: p.userId,
      accepted: p.accepted,
    })),
    secondsRemaining: Math.max(
      0,
      Math.floor((session.expiresAt - Date.now()) / 1000)
    ),
  };
}

/**
 * Get non-acceptors (dodgers)
 * @param {string} matchId - Match identifier
 * @returns {Promise<string[]>} Array of user IDs who didn't accept
 */
export async function getNonAcceptors(matchId) {
  try {
    const session = await ReadySession.findOne({
      matchId,
      status: 'active',
    }).lean();

    if (!session) return [];

    return session.players
      .filter((p) => !p.accepted)
      .map((p) => p.userId);
  } catch (error) {
    logger.error(`Failed to get non-acceptors: ${error.message}`, { matchId });
    return [];
  }
}

/**
 * Mark ready session as completed
 * @param {string} matchId - Match identifier
 * @param {string} nextPhase - Next phase name
 * @returns {Promise<Object>} Completed session
 */
export async function completeReadyPhase(matchId, nextPhase = 'draft') {
  try {
    const session = await ReadySession.findOneAndUpdate(
      { matchId, status: 'active' },
      {
        status: 'completed',
        completedAt: new Date(),
      },
      { new: true }
    );

    if (!session) {
      logger.warn(`No active session to complete for matchId: ${matchId}`);
      return null;
    }

    logger.info(
      `Ready phase completed: { matchId: ${matchId}, nextPhase: ${nextPhase} }`
    );

    return session;
  } catch (error) {
    logger.error(`Failed to complete ready phase: ${error.message}`, {
      matchId,
      error: error.stack,
    });
    throw error;
  }
}

/**
 * Handle ready phase timeout
 * @param {string} matchId - Match identifier
 * @returns {Promise<Object>} Timeout session with non-acceptors
 */
export async function handleReadyTimeout(matchId) {
  try {
    const session = await ReadySession.findOneAndUpdate(
      { matchId, status: 'active' },
      {
        status: 'timeout',
      },
      { new: true }
    );

    if (!session) {
      logger.warn(`No active session for timeout matchId: ${matchId}`);
      return null;
    }

    const nonAcceptors = session.players
      .filter((p) => !p.accepted)
      .map((p) => p.userId);

    logger.info(
      `Ready phase timeout: { matchId: ${matchId}, dodgers: ${nonAcceptors.length} }`
    );

    return {
      matchId,
      queueGroupId: session.queueGroupId,
      nonAcceptors,
      acceptors: session.players
        .filter((p) => p.accepted)
        .map((p) => p.userId),
    };
  } catch (error) {
    logger.error(`Failed to handle ready timeout: ${error.message}`, {
      matchId,
      error: error.stack,
    });
    throw error;
  }
}

/**
 * Cancel a ready session
 * @param {string} matchId - Match identifier
 * @returns {Promise<Object>} Cancelled session
 */
export async function cancelReadySession(matchId) {
  try {
    const session = await ReadySession.findOneAndUpdate(
      { matchId, status: 'active' },
      {
        status: 'cancelled',
      },
      { new: true }
    );

    if (!session) {
      logger.warn(`No active session to cancel for matchId: ${matchId}`);
      return null;
    }

    logger.info(`Ready session cancelled: { matchId: ${matchId} }`);

    return session;
  } catch (error) {
    logger.error(`Failed to cancel ready session: ${error.message}`, {
      matchId,
      error: error.stack,
    });
    throw error;
  }
}

/**
 * Get all active ready sessions
 * @returns {Promise<Array>} Array of active sessions
 */
export async function getActiveSessions() {
  try {
    return await ReadySession.find({ status: 'active' }).lean();
  } catch (error) {
    logger.error(`Failed to get active sessions: ${error.message}`);
    return [];
  }
}

/**
 * Initialize timeout for a ready session
 * @param {string} matchId - Match identifier
 * @param {number} timeoutSeconds - Timeout in seconds
 * @param {Function} onTimeout - Callback when timeout expires
 */
export function initializeReadyTimeout(matchId, timeoutSeconds = 20, onTimeout) {
  const timeoutId = setTimeout(async () => {
    const result = await handleReadyTimeout(matchId);
    if (result && onTimeout) {
      onTimeout(result);
    }
  }, timeoutSeconds * 1000);

  return timeoutId;
}
