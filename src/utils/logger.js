/**
 * Logger utility for consistent logging across the application
 * @module utils/logger
 */

class Logger {
  /**
   * Log an info message
   * @param {string} message - The message to log
   * @param {*} data - Optional data to log
   */
  info(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ℹ️ INFO: ${message}`, data || '');
  }

  /**
   * Log an error message
   * @param {string} message - The message to log
   * @param {Error|*} error - The error or data to log
   */
  error(message, error = null) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ❌ ERROR: ${message}`, error || '');
  }

  /**
   * Log a warning message
   * @param {string} message - The message to log
   * @param {*} data - Optional data to log
   */
  warn(message, data = null) {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] ⚠️ WARN: ${message}`, data || '');
  }

  /**
   * Log a debug message
   * @param {string} message - The message to log
   * @param {*} data - Optional data to log
   */
  debug(message, data = null) {
    const timestamp = new Date().toISOString();
    if (process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development') {
      console.log(`[${timestamp}] 🐛 DEBUG: ${message}`, data || '');
    }
  }

  /**
   * Log a success message
   * @param {string} message - The message to log
   * @param {*} data - Optional data to log
   */
  success(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ✅ SUCCESS: ${message}`, data || '');
  }
}

export default new Logger();
