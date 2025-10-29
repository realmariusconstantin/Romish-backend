import config from '../config/env.js';

// In-memory feature flags with ability to toggle at runtime (dev only)
const flags = {
  skipAcceptPhase: !!config.skipAcceptPhase,
};

export function setFlag(key, value) {
  if (Object.prototype.hasOwnProperty.call(flags, key)) {
    flags[key] = value;
    // Also update config for backward compatibility in runtime
    try {
      config[key] = value;
    } catch (err) {
      // ignore
    }
    return true;
  }
  return false;
}

export function getFlag(key) {
  return flags[key];
}

export default flags;
