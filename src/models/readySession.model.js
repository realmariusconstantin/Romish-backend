import mongoose from 'mongoose';

const readySessionSchema = new mongoose.Schema(
  {
    matchId: {
      type: String,
      required: true,
      unique: true,
    },
    queueGroupId: {
      type: String,
      required: false,
    },
    playerIds: {
      type: [String],
      required: true,
      validate: {
        validator: (v) => v.length === 10,
        message: 'Ready session must have exactly 10 players',
      },
    },
    players: [
      {
        userId: {
          type: String,
          required: true,
        },
        accepted: {
          type: Boolean,
          default: false,
        },
        acceptedAt: {
          type: Date,
          default: null,
        },
      },
    ],
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'timeout', 'cancelled'],
      default: 'active',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Compound index for unique matchId removed - unique is set on field
// TTL index for automatic cleanup removed - TTL is set on field via index option


const ReadySession = mongoose.model('ReadySession', readySessionSchema);

export default ReadySession;
