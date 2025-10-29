/**
 * Counter Model
 * Simple counter for generating incrementing match IDs for MatchZy
 */

import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});

const Counter = mongoose.model('Counter', counterSchema);

/**
 * Get next match ID counter value
 * @returns {Promise<number>} Next match ID (starts from 1)
 */
export const getNextMatchId = async () => {
  const counter = await Counter.findByIdAndUpdate(
    { _id: 'matchId' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
};

export default Counter;
