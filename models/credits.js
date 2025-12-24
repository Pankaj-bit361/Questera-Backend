const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// Plan definitions with Razorpay Plan IDs (INR)
const PLAN_CONFIG = {
  free: {
    name: 'Free',
    credits: 20,
    price: 0,
    razorpayPlanId: null,
  },
  growth: {
    name: 'Velos Growth',
    credits: 100,
    price: 1000, // ₹1,000/month
    razorpayPlanId: 'plan_RWN6JIj7uVFq68',
  },
  pro: {
    name: 'Velos Pro',
    credits: 250,
    price: 1800, // ₹1,800/month
    razorpayPlanId: 'plan_RWMcpE4Eq1vFo7',
  },
  business: {
    name: 'Velos Business Plus',
    credits: 1500,
    price: 10000, // ₹10,000/month
    razorpayPlanId: 'plan_Rvct2jukhNC9ek',
  },
};

// Transaction types
const TRANSACTION_TYPES = ['credit_add', 'credit_deduct', 'subscription', 'refund', 'bonus', 'manual'];

// Transaction schema for credit history
const transactionSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    default: () => 'txn-' + uuidv4(),
  },
  type: {
    type: String,
    enum: TRANSACTION_TYPES,
    required: true,
  },
  amount: {
    type: Number,
    required: true, // Positive for add, negative for deduct
  },
  description: {
    type: String,
  },
  // Reference to what used the credit (e.g., imageChatId, messageId)
  reference: {
    type: String,
  },
  referenceType: {
    type: String,
    enum: ['image_generation', 'subscription', 'manual', 'bonus', 'refund'],
  },
  balanceAfter: {
    type: Number,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Main credits schema
const creditsSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  // Current credit balance
  balance: {
    type: Number,
    default: 20, // Free plan starts with 20 credits
    min: 0,
  },
  // Current plan
  plan: {
    type: String,
    enum: ['free', 'growth', 'pro', 'business'],
    default: 'free',
  },
  planName: {
    type: String,
    default: 'Free',
  },
  // Razorpay subscription info
  razorpayCustomerId: {
    type: String,
  },
  razorpaySubscriptionId: {
    type: String,
  },
  subscriptionStatus: {
    type: String,
    enum: ['active', 'canceled', 'past_due', 'trialing', 'none'],
    default: 'none',
  },
  // Billing cycle dates
  currentPeriodStart: {
    type: Date,
  },
  currentPeriodEnd: {
    type: Date,
  },
  // Credits reset info (for monthly plans)
  lastCreditReset: {
    type: Date,
    default: Date.now,
  },
  // Total credits used all time
  totalCreditsUsed: {
    type: Number,
    default: 0,
  },
  // Transaction history
  transactions: [transactionSchema],
}, { timestamps: true });

// Helper method to check if user has enough credits
creditsSchema.methods.hasEnoughCredits = function (amount = 1) {
  return this.balance >= amount;
};

// Helper method to get plan config
creditsSchema.statics.getPlanConfig = function (planKey) {
  return PLAN_CONFIG[planKey] || PLAN_CONFIG.free;
};

// Helper method to get plan by Razorpay Plan ID
creditsSchema.statics.getPlanByRazorpayId = function (razorpayPlanId) {
  for (const [key, config] of Object.entries(PLAN_CONFIG)) {
    if (config.razorpayPlanId === razorpayPlanId) {
      return { key, ...config };
    }
  }
  return null;
};

// Export plan config for use in other modules
module.exports = mongoose.model('Credits', creditsSchema);
module.exports.PLAN_CONFIG = PLAN_CONFIG;
module.exports.TRANSACTION_TYPES = TRANSACTION_TYPES;