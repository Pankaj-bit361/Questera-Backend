const { OAuth2Client } = require('google-auth-library');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const jwt = require('jsonwebtoken');
const User = require('../models/user');

class AuthController {
    constructor() {
        this.googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
        this.ses = new SESClient({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        this.jwtSecret = process.env.JWT_SECRET;
        this.senderEmail = process.env.SES_SENDER_EMAIL;
    }

    generateToken(user) {
        return jwt.sign(
            { id: user._id, userId: user.userId, email: user.email },
            this.jwtSecret,
            { expiresIn: '7d' }
        );
    }

    generateOTP() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    /**
     * Google OAuth login
     */
    async googleLogin(req, res) {
        try {
            const { idToken } = req.body;
            if (!idToken) {
                return { status: 400, json: { error: 'ID token is required' } };
            }

            // Verify Google token
            const ticket = await this.googleClient.verifyIdToken({
                idToken,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
            const payload = ticket.getPayload();
            // Fixed typo here: removed 'kq'
            const { sub: googleId, email, name, picture } = payload;

            // Find or create user
            let user = await User.findOne({ email });

            if (user) {
                // Update existing user
                user.googleId = googleId;
                user.name = name || user.name;
                user.avatar = picture || user.avatar;
                user.lastLogin = new Date();
                user.isVerified = true;
                await user.save();
            } else {
                // Create new user
                user = await User.create({
                    email,
                    name,
                    avatar: picture,
                    authProvider: 'google',
                    googleId,
                    isVerified: true,
                    lastLogin: new Date(),
                });
            }

            const token = this.generateToken(user);

            return {
                status: 200,
                json: {
                    success: true,
                    token,
                    user: {
                        userId: user.userId,
                        email: user.email,
                        name: user.name,
                        avatar: user.avatar,
                    },
                },
            };
        } catch (error) {
            console.error('Google login error:', error);
            return { status: 500, json: { error: error.message } };
        }
    }

    /**
     * Send OTP to email
     */
    async sendOTP(req, res) {
        try {
            const { email } = req.body;
            if (!email) {
                return { status: 400, json: { error: 'Email is required' } };
            }

            const otp = this.generateOTP();
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

            // JW: Log OTP for development
            console.log(`\n🔐 OTP for ${email}: ${otp}\n`);

            // Find or create user
            let user = await User.findOne({ email });

            if (user) {
                user.otp = { code: otp, expiresAt };
                await user.save();
            } else {
                user = await User.create({
                    email,
                    authProvider: 'email',
                    otp: { code: otp, expiresAt },
                });
            }

            // Send email via SES with Premium Velos Template
            const emailParams = {
                Source: this.senderEmail,
                Destination: {
                    ToAddresses: [email]
                },
                Message: {
                    Subject: {
                        Data: 'Your Velos Verification Code'
                    },
                    Body: {
                        Html: {
                            Data: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Velos Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5; padding: 40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 480px; width: 100%; background-color: #ffffff; border-radius: 24px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); overflow: hidden; margin: 0 20px;">
          <!-- Header -->
          <tr>
            <td style="padding: 48px 40px 0 40px; text-align: center;">
              <div style="width: 56px; height: 56px; background-color: #000000; border-radius: 16px; margin: 0 auto 24px auto; line-height: 56px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                <span style="color: #ffffff; font-size: 28px; line-height: 56px;">⚡</span>
              </div>
              <h1 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; color: #18181b;">Velos</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 40px 40px 40px; text-align: center;">
              <p style="margin: 0 0 32px 0; font-size: 16px; line-height: 26px; color: #52525b; font-weight: 500;">
                Welcome back! Use the code below to securely sign in to your account.
              </p>
              
              <div style="background-color: #fafafa; border: 1px solid #e4e4e7; border-radius: 20px; padding: 24px 0; margin-bottom: 32px;">
                <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #000000; display: block; line-height: 1;">${otp}</span>
              </div>
              
              <p style="margin: 0; font-size: 14px; color: #a1a1aa; line-height: 20px;">
                This code will expire in <strong style="color: #71717a;">10 minutes</strong>.<br>If you didn't request this, please ignore this email.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #fafafa; padding: 24px; text-align: center; border-top: 1px solid #f4f4f5;">
              <p style="margin: 0; font-size: 12px; color: #d4d4d8; font-weight: 500;">
                &copy; ${new Date().getFullYear()} Velos AI. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
                            `,
                        },
                    },
                },
            };

            await this.ses.send(new SendEmailCommand(emailParams));

            return {
                status: 200,
                json: {
                    success: true,
                    message: 'OTP sent to email',
                },
            };
        } catch (error) {
            console.error('Send OTP error:', error);
            return { status: 500, json: { error: error.message } };
        }
    }

    /**
     * Verify OTP and login
     */
    async verifyOTP(req, res) {
        try {
            const { email, otp } = req.body;
            if (!email || !otp) {
                return { status: 400, json: { error: 'Email and OTP are required' } };
            }

            const user = await User.findOne({ email });

            if (!user) {
                return { status: 404, json: { error: 'User not found' } };
            }

            if (!user.otp || !user.otp.code) {
                return { status: 400, json: { error: 'No OTP requested' } };
            }

            if (user.otp.expiresAt < new Date()) {
                return { status: 400, json: { error: 'OTP expired' } };
            }

            if (user.otp.code !== otp) {
                return { status: 400, json: { error: 'Invalid OTP' } };
            }

            // Clear OTP and update user
            user.otp = undefined;
            user.isVerified = true;
            user.lastLogin = new Date();
            await user.save();

            const token = this.generateToken(user);

            return {
                status: 200,
                json: {
                    success: true,
                    token,
                    user: {
                        userId: user.userId,
                        email: user.email,
                        name: user.name,
                        avatar: user.avatar,
                    },
                },
            };
        } catch (error) {
            console.error('Verify OTP error:', error);
            return { status: 500, json: { error: error.message } };
        }
    }

    /**
     * Get current user profile
     */
    async getProfile(req, res) {
        try {
            const user = await User.findById(req.user.id).select('-otp');
            if (!user) {
                return { status: 404, json: { error: 'User not found' } };
            }

            return {
                status: 200,
                json: {
                    userId: user.userId,
                    email: user.email,
                    name: user.name,
                    avatar: user.avatar,
                    isVerified: user.isVerified,
                    createdAt: user.createdAt,
                },
            };
        } catch (error) {
            console.error('Get profile error:', error);
            return { status: 500, json: { error: error.message } };
        }
    }
}

module.exports = AuthController;