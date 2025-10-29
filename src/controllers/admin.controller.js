import User from '../models/user.model.js';
import Match from '../models/match.model.js';
import Queue from '../models/queue.model.js';
import featureFlags, { setFlag, getFlag } from '../utils/featureFlags.js';

/**
 * @desc    Get admin dashboard statistics
 * @route   GET /api/admin/stats
 * @access  Private (Admin only)
 */
export const getAdminStats = async (req, res) => {
  try {
    const [
      totalUsers,
      activeMatches,
      currentQueue,
      onlineUsers
    ] = await Promise.all([
      User.countDocuments(),
      Match.countDocuments({ status: { $in: ['live', 'warmup', 'knife_round'] } }),
      Queue.findOne({ status: { $in: ['waiting', 'full'] } }),
      User.countDocuments({ 
        lastLogin: { $gte: new Date(Date.now() - 15 * 60 * 1000) } // Online in last 15 min
      })
    ]);

    const queuedPlayers = currentQueue ? currentQueue.players.length : 0;

    res.json({
      success: true,
      stats: {
        totalUsers,
        activeMatches,
        queuedPlayers,
        onlineUsers
      }
    });
  } catch (error) {
    console.error('Get admin stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch admin statistics' 
    });
  }
};

/**
 * @desc    Get all users with filters
 * @route   GET /api/admin/users
 * @access  Private (Admin only)
 */
export const getAllUsers = async (req, res) => {
  try {
    const { 
      search = '', 
      status = 'all', 
      page = 1, 
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter query
    const filter = {};
    
    // Search by name or Steam ID
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { steamId: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by status
    if (status === 'online') {
      filter.lastLogin = { $gte: new Date(Date.now() - 15 * 60 * 1000) };
    } else if (status === 'inqueue') {
      filter.inQueue = true;
    } else if (status === 'banned') {
      filter.isBanned = true;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    // Get users and total count
    const [users, totalUsers] = await Promise.all([
      User.find(filter)
        .select('-__v')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(filter)
    ]);

    // Enhance users with status info
    const now = Date.now();
    const enhancedUsers = users.map(user => {
      const lastLoginTime = new Date(user.lastLogin).getTime();
      const isOnline = now - lastLoginTime < 15 * 60 * 1000; // 15 minutes
      
      let onlineStatus = 'offline';
      if (user.inQueue) {
        onlineStatus = 'inqueue';
      } else if (user.currentMatch) {
        onlineStatus = 'in-match';
      } else if (isOnline) {
        onlineStatus = 'online';
      }

      return {
        ...user,
        onlineStatus
      };
    });

    res.json({
      success: true,
      users: enhancedUsers,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalUsers / limit),
        totalUsers,
        usersPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch users' 
    });
  }
};

/**
 * @desc    Ban/unban a user
 * @route   PUT /api/admin/users/:steamId/ban
 * @access  Private (Admin only)
 */
export const banUser = async (req, res) => {
  try {
    const { steamId } = req.params;
    const { reason, duration } = req.body; // duration in hours (null = permanent)

    const user = await User.findOne({ steamId });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Prevent banning other admins
    if (user.isAdmin && user.steamId !== req.user.steamId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Cannot ban other admins' 
      });
    }

    // Calculate ban expiry
    const bannedUntil = duration 
      ? new Date(Date.now() + duration * 60 * 60 * 1000)
      : null;

    user.isBanned = true;
    user.banReason = reason || 'No reason provided';
    user.bannedBy = req.user.steamId;
    user.bannedAt = new Date();
    user.bannedUntil = bannedUntil;

    // Remove from queue if currently queued
    if (user.inQueue) {
      user.inQueue = false;
      // TODO: Remove from actual queue collection
    }

    await user.save();

    res.json({
      success: true,
      message: `User ${user.name} has been banned`,
      user: {
        steamId: user.steamId,
        name: user.name,
        isBanned: user.isBanned,
        banReason: user.banReason,
        bannedUntil: user.bannedUntil
      }
    });
  } catch (error) {
    console.error('Ban user error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to ban user' 
    });
  }
};

/**
 * @desc    Unban a user
 * @route   PUT /api/admin/users/:steamId/unban
 * @access  Private (Admin only)
 */
export const unbanUser = async (req, res) => {
  try {
    const { steamId } = req.params;

    const user = await User.findOne({ steamId });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    user.isBanned = false;
    user.banReason = null;
    user.bannedBy = null;
    user.bannedAt = null;
    user.bannedUntil = null;

    await user.save();

    res.json({
      success: true,
      message: `User ${user.name} has been unbanned`,
      user: {
        steamId: user.steamId,
        name: user.name,
        isBanned: user.isBanned
      }
    });
  } catch (error) {
    console.error('Unban user error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to unban user' 
    });
  }
};

/**
 * @desc    Get recent admin actions/activity log
 * @route   GET /api/admin/activity
 * @access  Private (Admin only)
 */
export const getActivityLog = async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    // Get recent queue joins
    const currentQueue = await Queue.findOne({ 
      status: { $in: ['waiting', 'full'] } 
    }).sort({ createdAt: -1 });

    const queueActivities = currentQueue ? currentQueue.players.map(player => ({
      type: 'queue_join',
      user: player.name,
      steamId: player.steamId,
      timestamp: player.joinedAt,
      description: `${player.name} joined the queue`
    })) : [];

    // Get recent matches
    const recentMatches = await Match.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const matchActivities = recentMatches.map(match => ({
      type: 'match_created',
      matchId: match._id,
      timestamp: match.createdAt,
      description: `Match ${match._id.toString().slice(-6)} created`
    }));

    // Get recently registered users
    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name steamId createdAt')
      .lean();

    const userActivities = recentUsers.map(user => ({
      type: 'user_registered',
      user: user.name,
      steamId: user.steamId,
      timestamp: user.createdAt,
      description: `${user.name} registered`
    }));

    // Combine and sort all activities
    const allActivities = [
      ...queueActivities,
      ...matchActivities,
      ...userActivities
    ]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, parseInt(limit));

    res.json({
      success: true,
      activities: allActivities
    });
  } catch (error) {
    console.error('Get activity log error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch activity log' 
    });
  }
};

/**
 * @desc    Get user details by Steam ID
 * @route   GET /api/admin/users/:steamId
 * @access  Private (Admin only)
 */
export const getUserDetails = async (req, res) => {
  try {
    const { steamId } = req.params;

    const user = await User.findOne({ steamId })
      .populate('currentMatch')
      .lean();

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Get user's match history
    const matchHistory = await Match.find({
      $or: [
        { 'teamA.players': user._id },
        { 'teamB.players': user._id }
      ]
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.json({
      success: true,
      user: {
        ...user,
        matchHistory
      }
    });
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch user details' 
    });
  }
};

/**
 * @desc    Delete a user (admin only)
 * @route   DELETE /api/admin/users/:steamId
 * @access  Private (Admin only)
 */
export const deleteUser = async (req, res) => {
  try {
    const { steamId } = req.params;

    const user = await User.findOne({ steamId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent deleting other admins
    if (user.isAdmin && user.steamId !== req.user.steamId) {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete another admin'
      });
    }

    // Delete user document
    await User.deleteOne({ _id: user._id });

    // Remove user references from matches
    const steamIdStr = user.steamId;

    await Match.updateMany(
      { 'players.steamId': steamIdStr },
      {
        $pull: {
          players: { steamId: steamIdStr },
          // Pull from teams arrays if present
          'teams.alpha': steamIdStr,
          'teams.beta': steamIdStr,
          'acceptPhase.requiredPlayers': { steamId: steamIdStr },
          'acceptPhase.acceptedPlayers': { steamId: steamIdStr }
        }
      }
    );

    // Remove from queue(s)
    await Queue.updateMany(
      {},
      {
        $pull: {
          players: { steamId: steamIdStr },
          'acceptPhase.acceptedPlayers': steamIdStr,
          'acceptPhase.declinedPlayers': steamIdStr
        }
      }
    );

    // Update any User documents that referenced this user as currentMatch or similar
    await User.updateMany(
      { currentMatch: user.currentMatch },
      { $set: { currentMatch: null, inQueue: false } }
    );

    // Emit admin action to socket (if available)
    const io = req.app.get('io');
    if (io) {
      io.emit('admin:user-deleted', { steamId: steamIdStr });
    }

    res.json({
      success: true,
      message: `User ${user.name} (${steamIdStr}) deleted and references cleaned up.`
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      details: error.message
    });
  }
};

/**
 * ========================================
 * TESTING FUNCTIONS (TEMPORARY - REMOVE IN PRODUCTION)
 * ========================================
 */

/**
 * @desc    Create a test match with admin as captain
 * @route   POST /api/admin/test/create-match
 * @access  Private (Admin only)
 */
export const createTestMatch = async (req, res) => {
  try {
    const { steamId, name, avatar } = req.user;

    // Create a test match with admin as both captains
    const match = await Match.create({
      matchId: `TEST-${Date.now()}`,
      players: [
        { steamId, name, avatar, team: 'undrafted' }
      ],
      captains: {
        alpha: steamId,  // Just the steamId
        beta: steamId    // Admin is both captains for testing
      },
      teams: {
        alpha: [steamId],
        beta: []
      },
      phase: 'draft',
      pickOrder: ['alpha', 'alpha', 'beta', 'beta', 'alpha', 'beta', 'alpha', 'beta'],
      currentPicker: 'alpha',
      pickIndex: 0,
      pickHistory: [],
      availableMaps: ['Dust II', 'Mirage', 'Inferno', 'Nuke', 'Overpass', 'Vertigo', 'Ancient', 'Aztec'],
      bannedMaps: [],
      selectedMap: null,
      vetoOrder: ['alpha', 'beta', 'alpha', 'beta', 'alpha', 'beta'],
      currentVeto: 'alpha',
      vetoIndex: 0
    });

    res.json({
      success: true,
      message: 'Test match created successfully',
      match: {
        matchId: match.matchId,
        phase: match.phase,
        captains: match.captains
      }
    });
  } catch (error) {
    console.error('Create test match error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create test match',
      details: error.message
    });
  }
};

/**
 * @desc    Skip to veto phase (complete draft automatically)
 * @route   POST /api/admin/test/skip-to-veto/:matchId
 * @access  Private (Admin only)
 */
export const skipToVetoPhase = async (req, res) => {
  try {
    const { matchId } = req.params;
    const { steamId, name, avatar } = req.user;

    const match = await Match.findOne({ matchId });

    if (!match) {
      return res.status(404).json({
        success: false,
        error: 'Match not found'
      });
    }

    // Fill teams with dummy players for testing
    const dummyPlayers = Array(8).fill(null).map((_, i) => ({
      steamId: `dummy-${i}`,
      name: `Player ${i + 1}`,
      avatar: avatar,
      team: i < 4 ? 'alpha' : 'beta'
    }));

    // Add dummy players to match.players array
    match.players = match.players.concat(dummyPlayers);

    // Update teams with steamIds only
    match.teams.alpha = [match.captains.alpha, 'dummy-0', 'dummy-1', 'dummy-2', 'dummy-3'];
    match.teams.beta = [match.captains.beta, 'dummy-4', 'dummy-5', 'dummy-6', 'dummy-7'];
    match.phase = 'veto';

    await match.save();

    // Emit Socket.IO event
    const io = req.app.get('io');
    if (io) {
      io.to(matchId).emit('match:phase-change', {
        matchId: match.matchId,
        phase: 'veto',
        teams: match.teams
      });
    }

    res.json({
      success: true,
      message: 'Skipped to veto phase',
      match: {
        matchId: match.matchId,
        phase: match.phase
      }
    });
  } catch (error) {
    console.error('Skip to veto error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to skip to veto phase',
      details: error.message
    });
  }
};

/**
 * @desc    Skip to match ready phase (complete veto automatically)
 * @route   POST /api/admin/test/skip-to-ready/:matchId
 * @access  Private (Admin only)
 */
export const skipToReadyPhase = async (req, res) => {
  try {
    const { matchId } = req.params;

    const match = await Match.findOne({ matchId });

    if (!match) {
      return res.status(404).json({
        success: false,
        error: 'Match not found'
      });
    }

    // Complete veto - ban all except one map
    match.bannedMaps = [
      { map: 'Mirage', bannedBy: 'alpha', bannedAt: new Date() },
      { map: 'Inferno', bannedBy: 'beta', bannedAt: new Date() },
      { map: 'Nuke', bannedBy: 'alpha', bannedAt: new Date() },
      { map: 'Overpass', bannedBy: 'beta', bannedAt: new Date() },
      { map: 'Vertigo', bannedBy: 'alpha', bannedAt: new Date() },
      { map: 'Ancient', bannedBy: 'beta', bannedAt: new Date() },
      { map: 'Aztec', bannedBy: 'alpha', bannedAt: new Date() }
    ];
    match.selectedMap = 'Dust II';
    match.phase = 'live';
    match.serverInfo = {
      ip: '192.168.1.100',
      port: '27015',
      password: 'test123',
      rconPassword: 'rcon123',
      connectString: 'connect 192.168.1.100:27015; password test123'
    };

    await match.save();

    // Emit Socket.IO event
    const io = req.app.get('io');
    if (io) {
      io.to(matchId).emit('match:phase-change', {
        matchId: match.matchId,
        phase: 'live',
        selectedMap: match.selectedMap,
        serverInfo: match.serverInfo
      });
    }

    res.json({
      success: true,
      message: 'Match ready! Server provisioned.',
      match: {
        matchId: match.matchId,
        phase: match.phase,
        selectedMap: match.selectedMap,
        serverInfo: match.serverInfo
      }
    });
  } catch (error) {
    console.error('Skip to ready error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to skip to ready phase',
      details: error.message
    });
  }
};

/**
 * @desc    Get all live matches
 * @route   GET /api/admin/matches/live
 * @access  Private (Admin only)
 */
export const getLiveMatches = async (req, res) => {
  try {
    const matches = await Match.find({
      phase: { $in: ['draft', 'veto', 'live'] }
    })
    .sort({ createdAt: -1 })
    .lean();

    res.json({
      success: true,
      matches
    });
  } catch (error) {
    console.error('Get live matches error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch live matches'
    });
  }
};

/**
 * @desc    Stop a live match
 * @route   POST /api/admin/matches/:matchId/stop
 * @access  Private (Admin only)
 */
export const stopMatch = async (req, res) => {
  try {
    const { matchId } = req.params;

    const match = await Match.findOne({ matchId });

    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    // Update match phase to cancelled
    match.phase = 'cancelled';
    match.completedAt = new Date();

    await match.save();

    // Update all players in the match
    await User.updateMany(
      { currentMatch: match._id },
      { $set: { currentMatch: null } }
    );

    // Emit Socket.IO event to notify all players
    const io = req.app.get('io');
    if (io) {
      io.to(matchId).emit('match:stopped', {
        matchId: match.matchId,
        message: 'Match has been stopped by an administrator'
      });
    }

    res.json({
      success: true,
      message: 'Match stopped successfully'
    });
  } catch (error) {
    console.error('Stop match error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop match'
    });
  }
};

