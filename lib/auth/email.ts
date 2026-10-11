import "server-only";

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<boolean> {
  const from = process.env.EMAIL_FROM || "ViPlay Studio <noreply@viplay.in>";
  const provider = (process.env.EMAIL_PROVIDER || "").toLowerCase();
  const resendApiKey = process.env.RESEND_API_KEY;

  // 1. Resend API
  if (provider === "resend" || resendApiKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject,
          html,
          text,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("Resend API error:", res.status, errText);
        return false;
      }
      return true;
    } catch (err) {
      console.error("Failed to send email via Resend:", err);
      return false;
    }
  }

  // 2. SMTP (via custom or nodemailer if installed)
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    try {
      const nodemailer = await (Function('m', 'return import(m)')("nodemailer") as Promise<any>).catch(() => null);
      if (nodemailer) {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: process.env.SMTP_SECURE === "true" || process.env.SMTP_PORT === "465",
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        await transporter.sendMail({
          from,
          to,
          subject,
          text,
          html,
        });
        return true;
      }
    } catch (err) {
      console.error("Failed to send email via SMTP:", err);
      // SMTP is configured but refused the message: report failure instead of pretending
      // the dev console "delivered" it
      return false;
    }
  }

  // 3. Development / Local Testing Fallback
  console.log("\n================ [EMAIL DISPATCHER (DEV)] ================");
  console.log(`To:      ${to}`);
  console.log(`From:    ${from}`);
  console.log(`Subject: ${subject}`);
  console.log("----------------------------------------------------------");
  console.log(text);
  console.log("==========================================================\n");
  return true;
}

export async function sendVerificationEmail(
  toEmail: string,
  name: string,
  token: string
): Promise<boolean> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;

  const subject = "Verify your email address — ViPlay Studio";
  const text = `Hi ${name},\n\nPlease verify your email for your ViPlay Studio account by clicking the link below:\n\n${verifyUrl}\n\nThis link expires in 24 hours.\n\nIf you did not sign up, please ignore this email.`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
      <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0;">Welcome to ViPlay Studio</h2>
      <p style="font-size: 14px; line-height: 1.6; color: #475569;">Hi ${name},</p>
      <p style="font-size: 14px; line-height: 1.6; color: #475569;">Thank you for registering. Please confirm your email address to activate your account and start creating videos:</p>
      <div style="margin: 28px 0; text-align: center;">
        <a href="${verifyUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px; display: inline-block;">Verify Email Address</a>
      </div>
      <p style="font-size: 12px; color: #94a3b8; line-height: 1.5;">Or copy and paste this URL into your browser:<br/><a href="${verifyUrl}" style="color: #2563eb; word-break: break-all;">${verifyUrl}</a></p>
      <p style="font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 24px;">This link will expire in 24 hours. If you did not create an account, you can safely ignore this message.</p>
    </div>
  `;

  return sendEmail({ to: toEmail, subject, text, html });
}

export async function sendPasswordResetEmail(
  toEmail: string,
  name: string,
  token: string
): Promise<boolean> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

  const subject = "Reset your password — ViPlay Studio";
  const text = `Hi ${name},\n\nWe received a request to reset the password for your ViPlay Studio account. Click the link below to set a new password:\n\n${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you did not request this, you can safely ignore this email.`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
      <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0;">Password Reset Request</h2>
      <p style="font-size: 14px; line-height: 1.6; color: #475569;">Hi ${name},</p>
      <p style="font-size: 14px; line-height: 1.6; color: #475569;">We received a request to reset the password for your ViPlay Studio account. Click the button below to set a new password:</p>
      <div style="margin: 28px 0; text-align: center;">
        <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px; display: inline-block;">Reset Password</a>
      </div>
      <p style="font-size: 12px; color: #94a3b8; line-height: 1.5;">Or copy and paste this URL into your browser:<br/><a href="${resetUrl}" style="color: #2563eb; word-break: break-all;">${resetUrl}</a></p>
      <p style="font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 24px;">This link will expire in 1 hour. If you did not make this request, please ignore this email.</p>
    </div>
  `;

  return sendEmail({ to: toEmail, subject, text, html });
}
