import express from 'express';
import {
  getCurrentMatch,
  getMatchById,
  pickPlayer,
  banMap,
  completeMatch,
  cancelMatch,
  getServerInfo,
  adminRemovePlayerFromMatch,
  adminClearUserMatchState,
  adminGetAllMatches,
  adminForceCompleteMatch,
  adminDeleteMatch,
  adminDeleteAllMatches,
} from '../controllers/match.controller.js';
import {
  acceptMatch,
  getAcceptStatus,
} from '../controllers/match-accept.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import {
  verifyMatchParticipant,
  verifyCaptain,
  verifyTurn,
  requirePhase,
} from '../middleware/phase.middleware.js';

const router = express.Router();

/**
 * @route   GET /api/match/current
 * @desc    Get current user's active match
 * @access  Private
 */
router.get('/current', authenticate, getCurrentMatch);

/**
 * @route   POST /api/match/:matchId/accept
 * @desc    Accept match during accept phase (Ready up)
 * @access  Private
 */
router.post(
  '/:matchId/accept',
  authenticate,
  acceptMatch
);

/**
 * @route   GET /api/match/:matchId/accept/status
 * @desc    Get accept phase status
 * @access  Private (must be participant)
 */
router.get(
  '/:matchId/accept/status',
  authenticate,
  verifyMatchParticipant,
  getAcceptStatus
);

/**
 * @route   GET /api/match/:matchId
 * @desc    Get match by ID
 * @access  Private (must be participant)
 */
router.get(
  '/:matchId',
  authenticate,
  verifyMatchParticipant,
  getMatchById
);

/**
 * @route   POST /api/match/:matchId/pick
 * @desc    Pick a player during draft phase
 * @access  Private (captain only, must be their turn)
 */
router.post(
  '/:matchId/pick',
  authenticate,
  verifyMatchParticipant,
  requirePhase('draft'),
  verifyCaptain,
  verifyTurn,
  pickPlayer
);

/**
 * @route   POST /api/match/:matchId/ban
 * @desc    Ban a map during veto phase
 * @access  Private (captain only, must be their turn)
 */
router.post(
  '/:matchId/ban',
  authenticate,
  verifyMatchParticipant,
  requirePhase('veto'),
  verifyCaptain,
  verifyTurn,
  banMap
);

/**
 * @route   GET /api/match/:matchId/server
 * @desc    Get server connection info
 * @access  Private (must be participant)
 */
router.get(
  '/:matchId/server',
  authenticate,
  verifyMatchParticipant,
  requirePhase(['live', 'complete']),
  getServerInfo
);

/**
 * @route   POST /api/match/:matchId/complete
 * @desc    Complete match with result
 * @access  Private (admin only)
 */
router.post(
  '/:matchId/complete',
  authenticate,
  requireAdmin,
  verifyMatchParticipant,
  requirePhase('live'),
  completeMatch
);

/**
 * @route   POST /api/match/:matchId/cancel
 * @desc    Cancel match
 * @access  Private (admin only)
 */
router.post(
  '/:matchId/cancel',
  authenticate,
  requireAdmin,
  verifyMatchParticipant,
  cancelMatch
);

/**
 * ADMIN CONTROLS
 */

/**
 * @route   GET /api/match/admin/all
 * @desc    Get all matches (active, completed, cancelled)
 * @access  Private (admin only)
 */
router.get('/admin/all', authenticate, requireAdmin, adminGetAllMatches);

/**
 * @route   POST /api/match/admin/:matchId/remove-player
 * @desc    Remove a player from a match
 * @access  Private (admin only)
 */
router.post(
  '/admin/:matchId/remove-player',
  authenticate,
  requireAdmin,
  adminRemovePlayerFromMatch
);

/**
 * @route   POST /api/match/admin/clear-user-state
 * @desc    Clear user's match/queue state (fix stuck states)
 * @access  Private (admin only)
 */
router.post(
  '/admin/clear-user-state',
  authenticate,
  requireAdmin,
  adminClearUserMatchState
);

/**
 * @route   POST /api/match/admin/:matchId/force-complete
 * @desc    Force complete a match without validation
 * @access  Private (admin only)
 */
router.post(
  '/admin/:matchId/force-complete',
  authenticate,
  requireAdmin,
  adminForceCompleteMatch
);

/**
 * @route   DELETE /api/match/admin/:matchId
 * @desc    Delete a single match
 * @access  Private (admin only)
 */
router.delete(
  '/admin/:matchId',
  authenticate,
  requireAdmin,
  adminDeleteMatch
);

/**
 * @route   DELETE /api/match/admin/all
 * @desc    Delete all matches (mass delete)
 * @access  Private (admin only)
 */
router.delete(
  '/admin/all',
  authenticate,
  requireAdmin,
  adminDeleteAllMatches
);

export default router;
