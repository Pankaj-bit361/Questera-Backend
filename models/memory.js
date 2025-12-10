const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const memorySchema = new mongoose.Schema({
  memoryId: {
    type: String,
    unique: true,
    default: () => 'mem-' + uuidv4(),
  },
  userId: {
    type: String,
    required: true,
    index: true,
  },
  profileId: {
    type: String,
    index: true,
  },
  type: {
    type: String,
    enum: ['preference', 'fact', 'style', 'goal', 'instruction', 'context'],
    required: true,
  },
  key: {
    type: String,
    required: true,
  },
  value: {
    type: String,
    required: true,
  },
  importance: {
    type: Number,
    min: 1,
    max: 5,
    default: 3,
  },
  // Source of this memory (chat, manual, inferred)
  source: {
    type: String,
    enum: ['chat', 'manual', 'inferred'],
    default: 'chat',
  },
  // How many times this memory has been referenced/used
  useCount: {
    type: Number,
    default: 0,
  },
  lastUsedAt: {
    type: Date,
  },
}, { timestamps: true });

// Compound index for efficient memory retrieval
memorySchema.index({ userId: 1, type: 1, importance: -1 });
memorySchema.index({ userId: 1, profileId: 1 });

module.exports = mongoose.model('Memory', memorySchema);