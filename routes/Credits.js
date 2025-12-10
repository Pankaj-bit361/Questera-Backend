const express = require('express');
const creditsRouter = express.Router();
const CreditsController = require('../functions/Credits');
const creditsController = new CreditsController();

/**
 * GET /credits/:userId
 * Get user's credits info
 */
creditsRouter.get('/:userId', async (req, res) => {
  try {
    const { status, json } = await creditsController.getCredits(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.error('[CREDITS] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /credits/:userId/transactions
 * Get user's transaction history
 */
creditsRouter.get('/:userId/transactions', async (req, res) => {
  try {
    const { status, json } = await creditsController.getTransactions(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.error('[CREDITS] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /credits/plans
 * Get available subscription plans
 */
creditsRouter.get('/plans/all', async (req, res) => {
  try {
    const { status, json } = await creditsController.getPlans(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.error('[CREDITS] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /credits/subscribe
 * Create a new Razorpay subscription
 */
creditsRouter.post('/subscribe', async (req, res) => {
  try {
    const { status, json } = await creditsController.createSubscription(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.error('[CREDITS] Subscribe Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /credits/verify-payment
 * Verify Razorpay payment after checkout
 */
creditsRouter.post('/verify-payment', async (req, res) => {
  try {
    const { status, json } = await creditsController.verifyPayment(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.error('[CREDITS] Verify Payment Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /credits/webhook/razorpay
 * Handle Razorpay webhook events
 */
creditsRouter.post('/webhook/razorpay', async (req, res) => {
  try {
    const { status, json } = await creditsController.handleRazorpayWebhook(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.error('[CREDITS] Webhook Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /credits/cancel-subscription
 * Cancel user's subscription and remove all credits
 */
creditsRouter.post('/cancel-subscription', async (req, res) => {
  try {
    const { status, json } = await creditsController.cancelSubscription(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.error('[CREDITS] Cancel Subscription Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = creditsRouter;