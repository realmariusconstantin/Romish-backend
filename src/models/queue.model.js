import mongoose from 'mongoose';
import User from './user.model.js';

const queueSchema = new mongoose.Schema({
  players: [{
    steamId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    avatar: {
      type: String,
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    position: {
      type: Number,
      required: true,
    },
    hasPriority: {
      type: Boolean,
      default: false,
    },
  }],
  status: {
    type: String,
    enum: ['waiting', 'accept_phase', 'full', 'processing', 'completed'],
    default: 'waiting',
  },
  requiredPlayers: {
    type: Number,
    default: 10,
  },
  // Accept Phase Fields
  acceptPhase: {
    active: {
      type: Boolean,
      default: false,
    },
    startedAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
    },
    acceptedPlayers: [{
      type: String, // steamId
    }],
    declinedPlayers: [{
      type: String, // steamId
    }],
    timeout: {
      type: Number,
      default: 20000, // 20 seconds accept phase
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 3600, // Auto-delete after 1 hour if not completed
  },
}, {
  timestamps: true,
});

// Indexes (createdAt index removed - TTL index already set via expires option)
queueSchema.index({ status: 1 });
queueSchema.index({ 'players.steamId': 1 });

// Methods
queueSchema.methods.addPlayer = function(player) {
  // Check if player already in queue
  const exists = this.players.some(p => p.steamId === player.steamId);
  if (exists) {
    throw new Error('Player already in queue');
  }

  // Check if queue is full
  if (this.players.length >= this.requiredPlayers) {
    throw new Error('Queue is full');
  }

  // Add player with position
  this.players.push({
    ...player,
    position: this.players.length + 1,
    joinedAt: new Date(),
  });

  // Update status if full
  if (this.players.length === this.requiredPlayers) {
    this.status = 'full';
  }

  return this.save();
};

queueSchema.methods.removePlayer = function(steamId) {
  const initialLength = this.players.length;
  this.players = this.players.filter(p => p.steamId !== steamId);
  
  if (this.players.length === initialLength) {
    throw new Error('Player not found in queue');
  }

  // Recalculate positions
  this.players.forEach((player, index) => {
    player.position = index + 1;
  });

  // Update status
  if (this.players.length < this.requiredPlayers) {
    this.status = 'waiting';
  }

  return this.save();
};

queueSchema.methods.isFull = function() {
  return this.players.length >= this.requiredPlayers;
};

queueSchema.methods.getPlayersBySteamIds = function(steamIds) {
  return this.players.filter(p => steamIds.includes(p.steamId));
};

// Accept Phase Methods
queueSchema.methods.startAcceptPhase = function() {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + this.acceptPhase.timeout);
  
  this.status = 'accept_phase';
  this.acceptPhase.active = true;
  this.acceptPhase.startedAt = now;
  this.acceptPhase.expiresAt = expiresAt;
  this.acceptPhase.acceptedPlayers = [];
  this.acceptPhase.declinedPlayers = [];
  
  return this.save();
};

queueSchema.methods.acceptMatch = function(steamId) {
  // Check if player is in queue
  const player = this.players.find(p => p.steamId === steamId);
  if (!player) {
    throw new Error('Player not in queue');
  }
  
  // Check if accept phase is active
  if (!this.acceptPhase.active) {
    throw new Error('Accept phase is not active');
  }
  
  // Check if already accepted
  if (this.acceptPhase.acceptedPlayers.includes(steamId)) {
    throw new Error('Player already accepted');
  }
  
  // Check if already declined
  if (this.acceptPhase.declinedPlayers.includes(steamId)) {
    throw new Error('Player already declined');
  }
  
  // Add to accepted players
  this.acceptPhase.acceptedPlayers.push(steamId);
  
  return this.save();
};

queueSchema.methods.declineMatch = function(steamId) {
  // Check if player is in queue
  const player = this.players.find(p => p.steamId === steamId);
  if (!player) {
    throw new Error('Player not in queue');
  }
  
  // Check if accept phase is active
  if (!this.acceptPhase.active) {
    throw new Error('Accept phase is not active');
  }
  
  // Add to declined players
  if (!this.acceptPhase.declinedPlayers.includes(steamId)) {
    this.acceptPhase.declinedPlayers.push(steamId);
  }
  
  return this.save();
};

queueSchema.methods.processAcceptPhaseResults = async function() {
  // Remove declined and non-responding players
  const acceptedSteamIds = this.acceptPhase.acceptedPlayers;
  const removedPlayers = [];
  
  // Give priority to accepted players
  this.players = this.players.filter(p => {
    if (acceptedSteamIds.includes(p.steamId)) {
      p.hasPriority = true;
      return true;
    } else {
      // Track removed players
      removedPlayers.push(p.steamId);
      return false;
    }
  });
  
  // Update inQueue status for removed players
  if (removedPlayers.length > 0) {
    await User.updateMany(
      { steamId: { $in: removedPlayers } },
      { $set: { inQueue: false } }
    );
    console.log(`✅ Updated inQueue status for ${removedPlayers.length} removed players`);
  }
  
  // Recalculate positions
  this.players.forEach((player, index) => {
    player.position = index + 1;
  });
  
  // Reset accept phase
  this.acceptPhase.active = false;
  this.acceptPhase.startedAt = null;
  this.acceptPhase.expiresAt = null;
  this.acceptPhase.acceptedPlayers = [];
  this.acceptPhase.declinedPlayers = [];
  
  // Update status
  if (this.players.length >= this.requiredPlayers) {
    this.status = 'full';
  } else {
    this.status = 'waiting';
  }
  
  return this.save();
};

queueSchema.methods.hasAccepted = function(steamId) {
  return this.acceptPhase.acceptedPlayers.includes(steamId);
};

queueSchema.methods.hasDeclined = function(steamId) {
  return this.acceptPhase.declinedPlayers.includes(steamId);
};

// Statics
queueSchema.statics.getActiveQueue = async function() {
  let queue = await this.findOne({ 
    status: { $in: ['waiting', 'full'] } 
  }).sort({ createdAt: 1 });

  // Create new queue if none exists
  if (!queue) {
    queue = await this.create({
      players: [],
      status: 'waiting',
    });
  }

  return queue;
};

queueSchema.statics.clearQueue = async function(queueId) {
  return await this.findByIdAndUpdate(
    queueId,
    { status: 'completed' },
    { new: true }
  );
};

const Queue = mongoose.model('Queue', queueSchema);

export default Queue;
