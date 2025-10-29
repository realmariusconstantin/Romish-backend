import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  steamId: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
  },
  avatar: {
    type: String,
    required: true,
  },
  profileUrl: {
    type: String,
    required: true,
  },
  // Trust & Eligibility
  trustScore: {
    type: Number,
    default: 100,
    min: 0,
    max: 100,
  },
  isCaptainEligible: {
    type: Boolean,
    default: true,
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
  // FACEIT Integration
  faceitLevel: {
    type: Number,
    default: null,
    min: 1,
    max: 10,
  },
  faceitElo: {
    type: Number,
    default: null,
  },
  faceitId: {
    type: String,
    default: null,
  },
  faceitLastUpdated: {
    type: Date,
    default: null,
  },
  // Ban System
  isBanned: {
    type: Boolean,
    default: false,
  },
  banReason: {
    type: String,
    default: null,
  },
  bannedBy: {
    type: String, // Admin's Steam ID
    default: null,
  },
  bannedAt: {
    type: Date,
    default: null,
  },
  bannedUntil: {
    type: Date, // null = permanent ban
    default: null,
  },
  // Stats
  stats: {
    matchesPlayed: {
      type: Number,
      default: 0,
    },
    wins: {
      type: Number,
      default: 0,
    },
    losses: {
      type: Number,
      default: 0,
    },
    rating: {
      type: Number,
      default: 1000,
    },
    captainCount: {
      type: Number,
      default: 0,
    },
  },
  // Current Status
  currentMatch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Match',
    default: null,
  },
  inQueue: {
    type: Boolean,
    default: false,
  },
  // Timestamps
  lastLogin: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Indexes for performance (steamId index removed - unique constraint handles it)
userSchema.index({ inQueue: 1 });
userSchema.index({ currentMatch: 1 });

// Methods
userSchema.methods.updateStats = function(won) {
  this.stats.matchesPlayed += 1;
  if (won) {
    this.stats.wins += 1;
    this.stats.rating += 25;
  } else {
    this.stats.losses += 1;
    this.stats.rating = Math.max(0, this.stats.rating - 25);
  }
  return this.save();
};

userSchema.methods.canJoinQueue = function() {
  return (
    !this.inQueue &&
    !this.currentMatch &&
    this.trustScore >= 50
  );
};

userSchema.methods.canBeCaptain = function() {
  return (
    this.isCaptainEligible &&
    this.trustScore >= 75 &&
    this.stats.matchesPlayed >= 5
  );
};

// Virtuals
userSchema.virtual('winRate').get(function() {
  if (this.stats.matchesPlayed === 0) return 0;
  return ((this.stats.wins / this.stats.matchesPlayed) * 100).toFixed(2);
});

// Ensure virtuals are included in JSON
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

const User = mongoose.model('User', userSchema);

export default User;
