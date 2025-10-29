import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getAdminStats,
  getAllUsers,
  getUserDetails,
  banUser,
  unbanUser,
  deleteUser,
  getActivityLog,
  createTestMatch,
  skipToVetoPhase,
  skipToReadyPhase,
  getLiveMatches,
  stopMatch
} from '../controllers/admin.controller.js';

const router = express.Router();

// Middleware to check if user is admin
// Note: Admins can access admin panel even while in a match
const isAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ 
      success: false, 
      message: 'Access denied. Admin privileges required.' 
    });
  }
  next();
};

/**
 * @route   GET /api/admin/stats
 * @desc    Get admin dashboard statistics
 * @access  Private (Admin only)
 */
router.get('/stats', authenticate, isAdmin, getAdminStats);

/**
 * @route   GET /api/admin/users
 * @desc    Get all users with filters and pagination
 * @access  Private (Admin only)
 */
router.get('/users', authenticate, isAdmin, getAllUsers);

/**
 * @route   GET /api/admin/users/:steamId
 * @desc    Get detailed user information
 * @access  Private (Admin only)
 */
router.get('/users/:steamId', authenticate, isAdmin, getUserDetails);

/**
 * @route   PUT /api/admin/users/:steamId/ban
 * @desc    Ban a user
 * @access  Private (Admin only)
 */
router.put('/users/:steamId/ban', authenticate, isAdmin, banUser);

/**
 * @route   PUT /api/admin/users/:steamId/unban
 * @desc    Unban a user
 * @access  Private (Admin only)
 */
router.put('/users/:steamId/unban', authenticate, isAdmin, unbanUser);

/**
 * @route   DELETE /api/admin/users/:steamId
 * @desc    Delete a user and clean up references
 * @access  Private (Admin only)
 */
router.delete('/users/:steamId', authenticate, isAdmin, deleteUser);

/**
 * @route   GET /api/admin/activity
 * @desc    Get recent activity log
 * @access  Private (Admin only)
 */
router.get('/activity', authenticate, isAdmin, getActivityLog);

/**
 * @route   GET /api/admin/matches/live
 * @desc    Get all live/active matches
 * @access  Private (Admin only)
 */
router.get('/matches/live', authenticate, isAdmin, getLiveMatches);

/**
 * @route   POST /api/admin/matches/:matchId/stop
 * @desc    Stop a live match
 * @access  Private (Admin only)
 */
router.post('/matches/:matchId/stop', authenticate, isAdmin, stopMatch);

/**
 * TESTING ENDPOINTS (TEMPORARY - REMOVE IN PRODUCTION)
 * These endpoints allow admins to test the matchmaking flow without needing 10 players
 */

/**
 * @route   POST /api/admin/test/create-match
 * @desc    Create a test match with admin as both captains
 * @access  Private (Admin only)
 */
router.post('/test/create-match', authenticate, isAdmin, createTestMatch);

/**
 * @route   POST /api/admin/test/skip-to-veto/:matchId
 * @desc    Skip draft phase and move directly to veto
 * @access  Private (Admin only)
 */
router.post('/test/skip-to-veto/:matchId', authenticate, isAdmin, skipToVetoPhase);

/**
 * @route   POST /api/admin/test/skip-to-ready/:matchId
 * @desc    Skip veto phase and move to match ready
 * @access  Private (Admin only)
 */
router.post('/test/skip-to-ready/:matchId', authenticate, isAdmin, skipToReadyPhase);

export default router;
