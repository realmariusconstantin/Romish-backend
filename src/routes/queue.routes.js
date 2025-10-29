import express from 'express';
import {
  joinQueue,
  leaveQueue,
  getQueueStatus,
  acceptMatch,
  declineMatch,
  clearQueue,
} from '../controllers/queue.controller.js';
import { acceptReady, getReadyStatus, getMyReadySession } from '../controllers/ready.controller.js';
import { authenticate, requireAdmin, canJoinQueue } from '../middleware/auth.middleware.js';
import { checkActiveMatch } from '../middleware/phase.middleware.js';

const router = express.Router();

/**
 * @route   POST /api/queue/join
 * @desc    Join the matchmaking queue
 * @access  Private
 */
router.post(
  '/join',
  authenticate,
  canJoinQueue,
  joinQueue
);

/**
 * @route   POST /api/queue/leave
 * @desc    Leave the matchmaking queue
 * @access  Private
 */
router.post('/leave', authenticate, leaveQueue);

/**
 * @route   GET /api/queue/status
 * @desc    Get current queue status
 * @access  Public
 */
router.get('/status', getQueueStatus);

/**
 * @route   POST /api/queue/accept
 * @desc    Accept match during accept phase
 * @access  Private
 */
router.post('/accept', authenticate, acceptMatch);

/**
 * POST /api/queue/ready/:matchId/accept
 * Accept a provisional ready session via HTTP (JWT in cookie)
 */
router.post('/ready/:matchId/accept', authenticate, acceptReady);

/**
 * GET /api/queue/ready/:matchId/status
 * Get provisional ready session status
 */
router.get('/ready/:matchId/status', authenticate, getReadyStatus);
// Get active ready session for current user
router.get('/ready/mine', authenticate, getMyReadySession);

/**
 * @route   POST /api/queue/decline
 * @desc    Decline match during accept phase
 * @access  Private
 */
router.post('/decline', authenticate, declineMatch);

/**
 * @route   DELETE /api/queue/clear
 * @desc    Clear the queue (admin only)
 * @access  Private (admin)
 */
router.delete('/clear', authenticate, requireAdmin, clearQueue);

export default router;
