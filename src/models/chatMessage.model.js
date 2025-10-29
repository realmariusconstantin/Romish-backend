import mongoose from 'mongoose';
import { nanoid } from 'nanoid';

const chatMessageSchema = new mongoose.Schema(
  {
    messageId: {
      type: String,
      default: () => nanoid(12),
      unique: true,
    },
    userId: {
      type: String,
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    text: {
      type: String,
      required: true,
      maxlength: 500,
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedBy: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Indexes for efficient queries
// Recent messages retrieval (descending by creation date)
chatMessageSchema.index({ createdAt: -1 });
// User's messages retrieval (compound index for userId + creation date)
chatMessageSchema.index({ userId: 1, createdAt: -1 });

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

export default ChatMessage;
