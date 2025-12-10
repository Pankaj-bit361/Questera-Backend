const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const User = require('../models/user');

class EmailService {
  constructor() {
    this.ses = new SESClient({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    this.senderEmail = process.env.SES_SENDER_EMAIL;
  }

  async getUserEmail(userId) {
    const user = await User.findOne({ userId });
    return user?.email;
  }

  async sendEmail(to, subject, htmlContent) {
    try {
      const emailParams = {
        Source: this.senderEmail,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject },
          Body: { Html: { Data: htmlContent } },
        },
      };
      await this.ses.send(new SendEmailCommand(emailParams));
      console.log('[EMAIL] Sent to ' + to + ': ' + subject);
      return { success: true };
    } catch (error) {
      console.error('[EMAIL] Error sending email:', error);
      return { success: false, error: error.message };
    }
  }

  wrapInTemplate(title, content) {
    const year = new Date().getFullYear();
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5; padding: 40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 480px; width: 100%; background-color: #ffffff; border-radius: 24px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); overflow: hidden; margin: 0 20px;">
          <tr>
            <td style="padding: 48px 40px 0 40px; text-align: center;">
              <div style="width: 56px; height: 56px; background-color: #000000; border-radius: 16px; margin: 0 auto 24px auto; line-height: 56px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                <span style="color: #ffffff; font-size: 28px; line-height: 56px;">&#9889;</span>
              </div>
              <h1 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; color: #18181b;">Velos</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 40px 40px 40px; text-align: center;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="background-color: #fafafa; padding: 24px; text-align: center; border-top: 1px solid #f4f4f5;">
              <p style="margin: 0; font-size: 12px; color: #d4d4d8; font-weight: 500;">&copy; ${year} Velos AI. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  async sendPostScheduledEmail(userId, post) {
    const email = await this.getUserEmail(userId);
    if (!email) return { success: false, error: 'User email not found' };

    const scheduledTime = new Date(post.scheduledAt).toLocaleString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    const captionPreview = post.caption ? post.caption.substring(0, 80) + (post.caption.length > 80 ? '...' : '') : 'No caption';

    const emailContent = `
      <p style="margin: 0 0 32px 0; font-size: 16px; line-height: 26px; color: #52525b; font-weight: 500;">
        Your post has been scheduled and will be published automatically to Instagram.
      </p>
      <div style="background-color: #fafafa; border: 1px solid #e4e4e7; border-radius: 20px; padding: 24px; margin-bottom: 24px;">
        <p style="margin: 0 0 8px 0; font-size: 12px; color: #a1a1aa; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">SCHEDULED FOR</p>
        <p style="margin: 0; font-size: 18px; font-weight: 700; color: #18181b;">${scheduledTime}</p>
      </div>
      <div style="background-color: #fafafa; border: 1px solid #e4e4e7; border-radius: 16px; padding: 20px; margin-bottom: 24px; text-align: left;">
        <p style="margin: 0 0 8px 0; font-size: 12px; color: #a1a1aa; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">CAPTION PREVIEW</p>
        <p style="margin: 0; font-size: 14px; color: #52525b; line-height: 1.5;">${captionPreview}</p>
      </div>
      <p style="margin: 0; font-size: 14px; color: #a1a1aa; line-height: 20px;">
        We will notify you once your post is published.<br>You can manage your scheduled posts in the Velos dashboard.
      </p>
    `;

    const html = this.wrapInTemplate('Post Scheduled - Velos', emailContent);
    return this.sendEmail(email, 'Your Post is Scheduled', html);
  }

  async sendPostPublishedEmail(userId, post) {
    const email = await this.getUserEmail(userId);
    if (!email) return { success: false, error: 'User email not found' };

    const publishedTime = new Date(post.publishedAt || new Date()).toLocaleString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    const emailContent = `
      <p style="margin: 0 0 32px 0; font-size: 16px; line-height: 26px; color: #52525b; font-weight: 500;">
        Great news! Your scheduled post has been successfully published to Instagram.
      </p>
      <div style="background-color: #dcfce7; border: 1px solid #86efac; border-radius: 20px; padding: 24px; margin-bottom: 24px;">
        <p style="margin: 0 0 8px 0; font-size: 12px; color: #166534; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">PUBLISHED AT</p>
        <p style="margin: 0; font-size: 18px; font-weight: 700; color: #166534;">${publishedTime}</p>
      </div>
      <p style="margin: 0; font-size: 14px; color: #a1a1aa; line-height: 20px;">
        Your post is now live on Instagram!<br>Check your Instagram profile to see it.
      </p>
    `;

    const html = this.wrapInTemplate('Post Published - Velos', emailContent);
    return this.sendEmail(email, 'Your Post is Now Live', html);
  }

  async sendPostFailedEmail(userId, post, errorMessage) {
    const email = await this.getUserEmail(userId);
    if (!email) return { success: false, error: 'User email not found' };

    const emailContent = `
      <p style="margin: 0 0 32px 0; font-size: 16px; line-height: 26px; color: #52525b; font-weight: 500;">
        Unfortunately, we could not publish your scheduled post. You can reschedule it.
      </p>
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 20px; padding: 24px; margin-bottom: 24px;">
        <p style="margin: 0 0 8px 0; font-size: 12px; color: #dc2626; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">ERROR DETAILS</p>
        <p style="margin: 0; font-size: 14px; color: #991b1b; line-height: 1.5;">${errorMessage || 'Unknown error occurred'}</p>
      </div>
      <p style="margin: 0; font-size: 14px; color: #a1a1aa; line-height: 20px;">
        Please check your Instagram connection and try again.<br>You can reschedule from the Velos dashboard.
      </p>
    `;

    const html = this.wrapInTemplate('Post Failed - Velos', emailContent);
    return this.sendEmail(email, 'Scheduled Post Failed', html);
  }
}

module.exports = EmailService;
