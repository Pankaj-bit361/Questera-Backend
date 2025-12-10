const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const referenceAssetSchema = new mongoose.Schema({
  assetId: {
    type: String,
    unique: true,
    default: () => 'asset-' + uuidv4(),
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
    enum: ['face', 'product', 'brand', 'mood', 'style'],
    required: true,
  },
  url: {
    type: String,
    required: true,
  },
  tags: [{
    type: String,
  }],
  // For face recognition / embeddings (future use)
  embeddingId: {
    type: String,
  },
  // Metadata about the asset
  meta: {
    filename: String,
    mimeType: String,
    size: Number,
    width: Number,
    height: Number,
    description: String,
  },
  isPrimary: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

// Index for quick lookup
referenceAssetSchema.index({ userId: 1, type: 1, isActive: 1 });
referenceAssetSchema.index({ userId: 1, profileId: 1, type: 1 });

module.exports = mongoose.model('ReferenceAsset', referenceAssetSchema);