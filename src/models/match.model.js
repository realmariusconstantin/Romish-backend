import mongoose from 'mongoose';
import { nanoid } from 'nanoid';

const matchSchema = new mongoose.Schema({
  matchId: {
    type: String,
    required: true,
    unique: true,
    default: () => `MATCH-${nanoid(10)}`,
  },
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
    team: {
      type: String,
      enum: ['alpha', 'beta', 'undrafted'],
      default: 'undrafted',
    },
  }],
  captains: {
    alpha: {
      type: String, // steamId
      required: true,
    },
    beta: {
      type: String, // steamId
      required: true,
    },
  },
  teams: {
    alpha: [{
      type: String, // steamId
    }],
    beta: [{
      type: String, // steamId
    }],
  },
  phase: {
    type: String,
    enum: ['accept', 'draft', 'veto', 'ready', 'live', 'complete', 'cancelled'],
    default: 'accept', // Start with accept phase
  },
  
  // ============================================
  // ACCEPT PHASE - NEW
  // ============================================
  acceptPhase: {
    active: {
      type: Boolean,
      default: true, // Start active when match created
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 20000), // 20 seconds from now
    },
    timeout: {
      type: Number,
      default: 20000, // 20 seconds in milliseconds
    },
    acceptedPlayers: [{
      steamId: String,
      acceptedAt: Date,
    }],
    // Track which players are part of THIS match
    requiredPlayers: [{
      steamId: String,
      name: String,
    }],
  },
  
  // Draft Phase
  pickOrder: [{
    type: String, // 'alpha' or 'beta'
  }],
  currentPicker: {
    type: String,
    enum: ['alpha', 'beta'],
    default: 'alpha',
  },
  pickIndex: {
    type: Number,
    default: 0,
  },
  pickHistory: [{
    captain: String,
    steamId: String,
    pickedAt: Date,
  }],
  // Veto Phase
  availableMaps: {
    type: [String],
    default: ['Dust II', 'Mirage', 'Inferno', 'Nuke', 'Overpass', 'Vertigo', 'Ancient', 'Cache', 'Cobblestone', 'Anubis', 'Train', 'Aztec'],
  },
  bannedMaps: [{
    map: String,
    bannedBy: String, // 'alpha' or 'beta'
    bannedAt: Date,
  }],
  selectedMap: {
    type: String,
    default: null,
  },
  vetoOrder: {
    type: [String], // Array of 'alpha' or 'beta'
    default: [],
  },
  currentVeto: {
    type: String,
    enum: ['alpha', 'beta'],
    default: 'alpha',
  },
  vetoIndex: {
    type: Number,
    default: 0,
  },
  // Server Info
  serverInfo: {
    ip: {
      type: String,
      default: null,
    },
    password: {
      type: String,
      default: null,
    },
    rcon: {
      type: String,
      default: null,
    },
    serverId: {
      type: String,
      default: null,
    },
    connectString: {
      type: String,
      default: null,
    },
  },
  // Match Result
  result: {
    winner: {
      type: String,
      enum: ['alpha', 'beta', 'draw', null],
      default: null,
    },
    score: {
      alpha: {
        type: Number,
        default: 0,
      },
      beta: {
        type: Number,
        default: 0,
      },
    },
  },
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
  },
  draftStartedAt: {
    type: Date,
    default: null,
  },
  vetoStartedAt: {
    type: Date,
    default: null,
  },
  liveStartedAt: {
    type: Date,
    default: null,
  },
  completedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

// Indexes (matchId index removed - unique constraint handles it)
matchSchema.index({ phase: 1 });
matchSchema.index({ 'players.steamId': 1 });
matchSchema.index({ createdAt: -1 });

// Generate pick order: A A B B A B (Captain A picks 2, B picks 2, A picks 1, B picks 1, repeat)
matchSchema.methods.generatePickOrder = function() {
  // Total 8 picks for 10 players (2 captains + 8 picks)
  // Pattern: alpha, alpha, beta, beta, alpha, beta, alpha, beta
  this.pickOrder = [
    'alpha', 'alpha',  // Captain A picks 2
    'beta', 'beta',    // Captain B picks 2
    'alpha',           // Captain A picks 1
    'beta',            // Captain B picks 1
    'alpha',           // Captain A picks 1
    'beta',            // Captain B picks 1
  ];
  
  this.currentPicker = 'alpha';
  this.pickIndex = 0;
  
  return this.save();
};

// Generate veto order: alternating bans until 1 map remains
matchSchema.methods.generateVetoOrder = function() {
  // With 7 maps, need 6 bans to leave 1
  // Pattern: alpha, beta, alpha, beta, alpha, beta
  this.vetoOrder = [];
  const totalBans = this.availableMaps.length - 1;
  
  for (let i = 0; i < totalBans; i++) {
    this.vetoOrder.push(i % 2 === 0 ? 'alpha' : 'beta');
  }
  
  this.currentVeto = 'alpha';
  this.vetoIndex = 0;
  this.vetoStartedAt = new Date();
  
  return this.save();
};

// Pick a player during draft
matchSchema.methods.pickPlayer = function(steamId, captain) {
  // Validate it's this captain's turn
  if (this.currentPicker !== captain) {
    throw new Error('Not this captain\'s turn');
  }

  // Find player
  const player = this.players.find(p => p.steamId === steamId && p.team === 'undrafted');
  if (!player) {
    throw new Error('Player not found or already drafted');
  }

  // Add to team
  if (captain === 'alpha') {
    this.teams.alpha.push(steamId);
  } else {
    this.teams.beta.push(steamId);
  }

  // Update player team
  player.team = captain;

  // Record pick
  this.pickHistory.push({
    captain,
    steamId,
    pickedAt: new Date(),
  });

  // Move to next pick
  this.pickIndex++;
  if (this.pickIndex < this.pickOrder.length) {
    this.currentPicker = this.pickOrder[this.pickIndex];
  } else {
    // Draft complete - assign last player if any remain undrafted
    const lastPlayer = this.players.find(p => p.team === 'undrafted');
    if (lastPlayer) {
      // Determine which team needs the player to reach 5
      const team = this.teams.alpha.length < this.teams.beta.length ? 'alpha' : 'beta';
      this.teams[team].push(lastPlayer.steamId);
      lastPlayer.team = team;
    }
    
    // Move to veto phase and generate veto order
    this.phase = 'veto';
    this.vetoStartedAt = new Date();
    
    // Generate veto order inline instead of calling method that saves
    console.log(`📋 Generating veto order - Available maps: ${this.availableMaps.length}`, this.availableMaps);
    const totalBans = this.availableMaps.length - 1;
    this.vetoOrder = [];
    for (let i = 0; i < totalBans; i++) {
      this.vetoOrder.push(i % 2 === 0 ? 'alpha' : 'beta');
    }
    this.currentVeto = 'alpha';
    this.vetoIndex = 0;
    console.log(`✅ Veto order generated: ${this.vetoOrder.length} bans`, this.vetoOrder);
  }

  return this.save();
};

// Ban a map during veto
matchSchema.methods.banMap = function(mapName, captain) {
  // Validate it's this captain's turn
  if (this.currentVeto !== captain) {
    throw new Error('Not this captain\'s turn');
  }

  // Check if map is available
  if (!this.availableMaps.includes(mapName)) {
    throw new Error('Map not available or already banned');
  }

  // Remove from available maps
  this.availableMaps = this.availableMaps.filter(m => m !== mapName);

  // Add to banned maps
  this.bannedMaps.push({
    map: mapName,
    bannedBy: captain,
    bannedAt: new Date(),
  });
  
  // Check if veto is complete (only 1 map left)
  if (this.availableMaps.length === 1) {
    // Veto complete - one map remaining
    this.selectedMap = this.availableMaps[0];
    this.phase = 'ready'; // Transition to ready phase (loading screen while server provisions)
    this.readyStartedAt = new Date();
  } else {
    // Continue banning - alternate between teams
    this.vetoIndex++;
    this.currentVeto = this.currentVeto === 'alpha' ? 'beta' : 'alpha';
  }

  return this.save();
};

// Complete match with result
matchSchema.methods.completeMatch = function(winner, score) {
  this.phase = 'complete';
  this.completedAt = new Date();
  
  if (winner) {
    this.result.winner = winner;
  }
  
  if (score) {
    this.result.score = score;
  }

  // TODO: Update player stats
  // TODO: Delete Dathost server
  // TODO: Notify Discord bot of match completion

  return this.save();
};

// ============================================
// ACCEPT PHASE METHODS - NEW
// ============================================

/**
 * Accept match - player confirms they're ready
 * @param {String} steamId - Player's Steam ID
 * @returns {Promise} Saved match document
 */
matchSchema.methods.acceptMatch = function(steamId) {
  // Validate accept phase is active
  if (!this.acceptPhase.active) {
    throw new Error('Accept phase is not active');
  }
  
  // Check if accept phase expired
  if (new Date() > this.acceptPhase.expiresAt) {
    throw new Error('Accept phase has expired');
  }
  
  // Validate player is part of THIS match (not just any queue)
  const isInMatch = this.acceptPhase.requiredPlayers.some(p => p.steamId === steamId);
  if (!isInMatch) {
    throw new Error('Player is not part of this match');
  }
  
  // Check if already accepted
  const alreadyAccepted = this.acceptPhase.acceptedPlayers.some(p => p.steamId === steamId);
  if (alreadyAccepted) {
    throw new Error('Player already accepted');
  }
  
  // Add to accepted players
  this.acceptPhase.acceptedPlayers.push({
    steamId,
    acceptedAt: new Date(),
  });
  
  return this.save();
};

/**
 * Check if all players have accepted
 * @returns {Boolean}
 */
matchSchema.methods.allPlayersAccepted = function() {
  return this.acceptPhase.acceptedPlayers.length >= this.acceptPhase.requiredPlayers.length;
};

/**
 * Get accept phase status
 * @returns {Object} Status object
 */
matchSchema.methods.getAcceptStatus = function() {
  return {
    active: this.acceptPhase.active,
    acceptedCount: this.acceptPhase.acceptedPlayers.length,
    requiredCount: this.acceptPhase.requiredPlayers.length,
    acceptedPlayers: this.acceptPhase.acceptedPlayers.map(p => p.steamId),
    expiresAt: this.acceptPhase.expiresAt,
    timeRemaining: Math.max(0, this.acceptPhase.expiresAt - new Date()),
  };
};

/**
 * End accept phase and transition to next phase
 * @returns {Promise} Saved match document
 */
matchSchema.methods.endAcceptPhase = function() {
  this.acceptPhase.active = false;
  
  // If all players accepted, move to draft phase
  if (this.allPlayersAccepted()) {
    this.phase = 'draft';
    console.log(`✅ Match ${this.matchId}: All players accepted, moving to draft phase`);
  } else {
    // Not enough players accepted, cancel match
    this.phase = 'cancelled';
    console.log(`❌ Match ${this.matchId}: Not enough players accepted (${this.acceptPhase.acceptedPlayers.length}/${this.acceptPhase.requiredPlayers.length})`);
  }
  
  return this.save();
};

// ============================================
// DRAFT PHASE METHODS
// ============================================

// Cancel match
matchSchema.methods.cancelMatch = function() {
  this.phase = 'cancelled';
  this.completedAt = new Date();
  
  // TODO: Delete Dathost server if created
  // TODO: Notify Discord bot of cancellation

  return this.save();
};

// Get current picker/banner
matchSchema.methods.getCurrentTurn = function() {
  if (this.phase === 'draft') {
    return {
      phase: 'draft',
      captain: this.currentPicker,
      pickNumber: this.pickIndex + 1,
      totalPicks: this.pickOrder.length,
    };
  } else if (this.phase === 'veto') {
    return {
      phase: 'veto',
      captain: this.currentVeto,
      banNumber: this.vetoIndex + 1,
      totalBans: this.vetoOrder.length,
    };
  }
  return null;
};

// Statics
matchSchema.statics.createMatch = async function(players, captains) {
  const now = new Date();
  const timeout = 60000; // 60 seconds
  
  const match = await this.create({
    players: players.map(p => ({
      ...p,
      team: captains.includes(p.steamId) ? 
        (p.steamId === captains[0] ? 'alpha' : 'beta') : 
        'undrafted',
    })),
    captains: {
      alpha: captains[0],
      beta: captains[1],
    },
    teams: {
      alpha: [captains[0]],
      beta: [captains[1]],
    },
    phase: 'accept', // Start in accept phase
    acceptPhase: {
      active: true,
      startedAt: now,
      expiresAt: new Date(now.getTime() + timeout),
      timeout,
      acceptedPlayers: [],
      requiredPlayers: players.map(p => ({
        steamId: p.steamId,
        name: p.name,
      })),
    },
    availableMaps: ['Dust II', 'Mirage', 'Inferno', 'Nuke', 'Overpass', 'Vertigo', 'Ancient', 'Cache', 'Cobblestone', 'Anubis', 'Train', 'Aztec'],
    draftStartedAt: null, // Will be set when accept phase completes
  });

  await match.generatePickOrder();
  return match;
};

const Match = mongoose.model('Match', matchSchema);

export default Match;
