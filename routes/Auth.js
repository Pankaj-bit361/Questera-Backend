const express = require('express');
const authRouter = express.Router();
const AuthController = require('../functions/Auth');
const authMiddleware = require('../middlewares/auth');

const authController = new AuthController();

// Google OAuth login
authRouter.post("/google", async (req, res) => {
    try {
        const { status, json } = await authController.googleLogin(req, res);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Send OTP to email
authRouter.post("/send-otp", async (req, res) => {
    try {
        const { status, json } = await authController.sendOTP(req, res);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Verify OTP and login
authRouter.post("/verify-otp", async (req, res) => {
    try {
        const { status, json } = await authController.verifyOTP(req, res);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Get current user profile (protected)
authRouter.get("/profile", authMiddleware, async (req, res) => {
    try {
        const { status, json } = await authController.getProfile(req, res);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

module.exports = authRouter;