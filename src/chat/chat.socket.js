/**
 * Chat Socket Module - Handles global chat functionality
 * @module chat.socket
 */

import ChatMessage from '../models/chatMessage.model.js';
import logger from '../utils/logger.js';

// Rate limiting: { userId: { count, resetTime } }
const rateLimitMap = new Map();
const RATE_LIMIT_MESSAGES = 5;
const RATE_LIMIT_WINDOW = 10000; // 10 seconds in ms

/**
 * Check if user has exceeded rate limit
 * @param {string} userId - User ID
 * @returns {boolean} True if rate limited
 */
function isRateLimited(userId) {
  const now = Date.now();

  if (!rateLimitMap.has(userId)) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return false;
  }

  const userLimit = rateLimitMap.get(userId);

  if (now >= userLimit.resetTime) {
    // Reset window
    userLimit.count = 1;
    userLimit.resetTime = now + RATE_LIMIT_WINDOW;
    return false;
  }

  userLimit.count++;
  return userLimit.count > RATE_LIMIT_MESSAGES;
}

/**
 * Get recent chat messages
 * @param {number} limit - Number of messages to retrieve (default 50)
 * @returns {Promise<Array>} Array of messages
 */
export async function getRecentMessages(limit = 50) {
  try {
    const messages = await ChatMessage.find(
      { isDeleted: false },
      { messageId: 1, userId: 1, username: 1, text: 1, createdAt: 1, _id: 0 }
    )
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();

    return messages;
  } catch (error) {
    logger.error(`Failed to get recent messages: ${error.message}`);
    return [];
  }
}

/**
 * Save a new chat message
 * @param {string} userId - User ID
 * @param {string} username - Username
 * @param {string} text - Message text
 * @returns {Promise<Object|null>} Saved message or null if rate limited
 */
export async function saveChatMessage(userId, username, text) {
  try {
    // Validate input
    if (!userId || !username || !text) {
      logger.warn(
        `Invalid chat message input: { userId: ${userId}, username: ${username}, textLength: ${text?.length} }`
      );
      return null;
    }

    if (text.length > 500) {
      logger.warn(
        `Message exceeds max length: { userId: ${userId}, length: ${text.length} }`
      );
      return null;
    }

    // Check rate limit
    if (isRateLimited(userId)) {
      logger.info(`Rate limit exceeded: { userId: ${userId} }`);
      return { rateLimited: true };
    }

    // Create and save message
    const message = new ChatMessage({
      userId,
      username,
      text: text.trim(),
    });

    await message.save();

    logger.info(
      `Message saved: { messageId: ${message.messageId}, userId: ${userId} }`
    );

    return {
      messageId: message.messageId,
      userId: message.userId,
      username: message.username,
      text: message.text,
      createdAt: message.createdAt,
    };
  } catch (error) {
    logger.error(`Failed to save chat message: ${error.message}`, {
      userId,
      error: error.stack,
    });
    throw error;
  }
}

/**
 * Delete a chat message (soft delete)
 * @param {string} messageId - Message ID
 * @param {string} deletedBy - Admin user ID
 * @returns {Promise<Object|null>} Deleted message or null
 */
export async function deleteChatMessage(messageId, deletedBy) {
  try {
    if (!messageId || !deletedBy) {
      throw new Error('messageId and deletedBy are required');
    }

    const message = await ChatMessage.findOneAndUpdate(
      { messageId, isDeleted: false },
      {
        isDeleted: true,
        deletedBy,
      },
      { new: true }
    );

    if (!message) {
      logger.warn(`Message not found or already deleted: ${messageId}`);
      return null;
    }

    logger.info(
      `Message deleted: { messageId: ${messageId}, deletedBy: ${deletedBy} }`
    );

    return message;
  } catch (error) {
    logger.error(`Failed to delete message: ${error.message}`, {
      messageId,
      error: error.stack,
    });
    throw error;
  }
}

/**
 * Get online count in chat room
 * @param {number} connectionCount - Current connection count from Socket.IO
 * @returns {number} Online user count
 */
export function getOnlineCount(connectionCount) {
  return Math.max(0, connectionCount);
}

/**
 * Clean up old messages (keep only last 50)
 * @returns {Promise<Object>} Delete result
 */
export async function cleanupOldMessages() {
  try {
    const count = await ChatMessage.countDocuments({ isDeleted: false });
    const limit = 50;

    if (count <= limit) {
      return { deleted: 0 };
    }

    const toDelete = count - limit;

    // Find oldest messages to delete
    const oldMessages = await ChatMessage.find(
      { isDeleted: false },
      { _id: 1 }
    )
      .sort({ createdAt: 1 })
      .limit(toDelete)
      .lean();

    const messageIds = oldMessages.map((m) => m._id);

    const result = await ChatMessage.deleteMany({ _id: { $in: messageIds } });

    logger.info(`Cleaned up old messages: ${result.deletedCount} deleted`);

    return { deleted: result.deletedCount };
  } catch (error) {
    logger.error(`Failed to cleanup messages: ${error.message}`);
    return { deleted: 0 };
  }
}

/**
 * Ban user from chat (soft ban for 10 minutes)
 * Note: Implement as needed with banned user tracking
 * @param {string} userId - User ID to ban
 * @param {string} bannedBy - Admin user ID
 * @param {number} durationMinutes - Ban duration (default 10)
 * @returns {Promise<Object>} Ban info
 */
export async function softBanUser(userId, bannedBy, durationMinutes = 10) {
  try {
    const banExpires = new Date(Date.now() + durationMinutes * 60 * 1000);

    logger.info(
      `User banned from chat: { userId: ${userId}, bannedBy: ${bannedBy}, expires: ${banExpires} }`
    );

    // Implement actual ban tracking if needed (e.g., Redis cache or separate collection)
    return {
      userId,
      bannedBy,
      banExpires,
      durationMinutes,
    };
  } catch (error) {
    logger.error(`Failed to ban user: ${error.message}`, { userId });
    throw error;
  }
}

/**
 * Clear rate limit for a user (admin action)
 * @param {string} userId - User ID
 */
export function clearRateLimit(userId) {
  rateLimitMap.delete(userId);
  logger.info(`Rate limit cleared for user: ${userId}`);
}

/**
 * Get rate limit status for user (for debugging)
 * @param {string} userId - User ID
 * @returns {Object} Rate limit status
 */
export function getRateLimitStatus(userId) {
  if (!rateLimitMap.has(userId)) {
    return { rateLimited: false, count: 0, remaining: RATE_LIMIT_MESSAGES };
  }

  const userLimit = rateLimitMap.get(userId);
  const now = Date.now();
  const resetTime = userLimit.resetTime;
  const isLimited = userLimit.count > RATE_LIMIT_MESSAGES;

  return {
    rateLimited: isLimited,
    count: userLimit.count,
    remaining: Math.max(0, RATE_LIMIT_MESSAGES - userLimit.count),
    resetInSeconds: Math.ceil((resetTime - now) / 1000),
  };
}

/**
 * Periodically cleanup old rate limit entries
 * Call this on server startup or via cron job
 */
export function initializeCleanupTasks() {
  // Cleanup old messages periodically (every 5 minutes)
  setInterval(async () => {
    await cleanupOldMessages();
  }, 5 * 60 * 1000);

  // Cleanup stale rate limit entries (every 30 minutes)
  setInterval(() => {
    const now = Date.now();
    for (const [userId, data] of rateLimitMap.entries()) {
      if (now >= data.resetTime) {
        rateLimitMap.delete(userId);
      }
    }
    logger.debug(`Rate limit cleanup completed`);
  }, 30 * 60 * 1000);
}
