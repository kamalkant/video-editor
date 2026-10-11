import "server-only";
import { sendEmail } from "@/lib/auth/email";
import { logEmailDispatch } from "@/lib/db/email-logs";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

function baseEmailTemplate(title: string, contentHtml: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 24px;">
        <span style="font-size: 20px; font-weight: 800; color: #2563eb;">ViPlay Studio</span>
      </div>
      <h2 style="font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 0;">${title}</h2>
      <div style="font-size: 14px; line-height: 1.6; color: #475569;">
        ${contentHtml}
      </div>
      <div style="font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 28px; text-align: center;">
        Sent by ViPlay Studio &bull; <a href="${APP_URL}/account/billing" style="color: #2563eb; text-decoration: none;">Manage Billing</a>
      </div>
    </div>
  `;
}

export async function sendPaymentSuccessEmail(data: {
  toEmail: string;
  userName: string;
  invoiceNumber: string;
  planName: string;
  amount: number;
  currency: string;
}): Promise<boolean> {
  const subject = `Payment Confirmation - ${data.invoiceNumber}`;
  const formattedAmount = (data.amount / 100).toFixed(2);
  const curSymbol = data.currency === "INR" ? "₹" : "$";

  const html = baseEmailTemplate(
    "Payment Received & Plan Activated",
    `<p>Hi ${data.userName},</p>
     <p>Your payment of <strong>${curSymbol}${formattedAmount}</strong> has been successfully processed.</p>
     <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
       <div style="font-size: 13px; color: #64748b;">Plan: <strong style="color: #0f172a;">${data.planName}</strong></div>
       <div style="font-size: 13px; color: #64748b; margin-top: 6px;">Invoice: <strong style="color: #0f172a;">${data.invoiceNumber}</strong></div>
     </div>
     <p>All plan benefits and AI Studio credits are now unlocked in your studio.</p>
     <div style="margin: 24px 0; text-align: center;">
       <a href="${APP_URL}/account/billing" style="background: #2563eb; color: #ffffff; padding: 10px 20px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px; display: inline-block;">View Receipt</a>
     </div>`
  );

  const text = `Hi ${data.userName}, your payment of ${curSymbol}${formattedAmount} for ${data.planName} (Invoice: ${data.invoiceNumber}) was successful.`;

  const sent = await sendEmail({ to: data.toEmail, subject, text, html });
  logEmailDispatch({
    toEmail: data.toEmail,
    subject,
    templateName: "payment_success",
    status: sent ? "sent" : "failed",
  });
  return sent;
}

export async function sendPaymentFailedEmail(data: {
  toEmail: string;
  userName: string;
  planName: string;
  reason?: string;
}): Promise<boolean> {
  const subject = "Payment Issue on your ViPlay Subscription";
  const html = baseEmailTemplate(
    "We could not process your payment",
    `<p>Hi ${data.userName},</p>
     <p>We attempted to process your subscription payment for <strong>${data.planName}</strong>, but the transaction could not be completed.</p>
     ${data.reason ? `<p style="color: #ef4444; font-size: 13px;">Reason: ${data.reason}</p>` : ""}
     <p>Your studio access remains protected during your grace period. Please update your payment method to ensure uninterrupted access.</p>
     <div style="margin: 24px 0; text-align: center;">
       <a href="${APP_URL}/account/billing" style="background: #2563eb; color: #ffffff; padding: 10px 20px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px; display: inline-block;">Update Payment Method</a>
     </div>`
  );

  const text = `Hi ${data.userName}, your payment for ${data.planName} could not be completed. Please visit ${APP_URL}/account/billing to update your payment method.`;

  const sent = await sendEmail({ to: data.toEmail, subject, text, html });
  logEmailDispatch({
    toEmail: data.toEmail,
    subject,
    templateName: "payment_failed",
    status: sent ? "sent" : "failed",
  });
  return sent;
}

export async function sendExpiryWarningEmail(data: {
  toEmail: string;
  userName: string;
  planName: string;
  daysRemaining: number;
}): Promise<boolean> {
  const subject = `Your ${data.planName} subscription renews in ${data.daysRemaining} days`;
  const html = baseEmailTemplate(
    "Upcoming Subscription Renewal",
    `<p>Hi ${data.userName},</p>
     <p>This is a friendly reminder that your <strong>${data.planName}</strong> plan is scheduled for automatic renewal in <strong>${data.daysRemaining} days</strong>.</p>
     <p>No action is needed if your payment details are up to date.</p>
     <div style="margin: 24px 0; text-align: center;">
       <a href="${APP_URL}/account/billing" style="background: #2563eb; color: #ffffff; padding: 10px 20px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px; display: inline-block;">Manage Subscription</a>
     </div>`
  );

  const text = `Hi ${data.userName}, your ${data.planName} plan renews in ${data.daysRemaining} days. Manage at ${APP_URL}/account/billing.`;

  const sent = await sendEmail({ to: data.toEmail, subject, text, html });
  logEmailDispatch({
    toEmail: data.toEmail,
    subject,
    templateName: "expiry_warning",
    status: sent ? "sent" : "failed",
  });
  return sent;
}

export async function sendRefundProcessedEmail(data: {
  toEmail: string;
  userName: string;
  amount: number;
  currency: string;
  reason: string;
}): Promise<boolean> {
  const subject = "Refund Processed — ViPlay Studio";
  const formattedAmount = (data.amount / 100).toFixed(2);
  const curSymbol = data.currency === "INR" ? "₹" : "$";

  const html = baseEmailTemplate(
    "Refund Confirmation",
    `<p>Hi ${data.userName},</p>
     <p>A refund of <strong>${curSymbol}${formattedAmount}</strong> has been processed for your account.</p>
     <p style="font-size: 13px; color: #64748b;">Reason: ${data.reason}</p>
     <p>Depending on your card issuer or bank, the refund will reflect in your account within 5-7 business days.</p>`
  );

  const text = `Hi ${data.userName}, a refund of ${curSymbol}${formattedAmount} has been processed.`;

  const sent = await sendEmail({ to: data.toEmail, subject, text, html });
  logEmailDispatch({
    toEmail: data.toEmail,
    subject,
    templateName: "refund_processed",
    status: sent ? "sent" : "failed",
  });
  return sent;
}

export async function sendReferralRewardEarnedEmail(data: {
  toEmail: string;
  userName: string;
  referredUserName: string;
  amount: number;
  holdingDays: number;
  currency: string;
}): Promise<boolean> {
  const formattedAmount = (data.amount / 100).toFixed(2);
  const curSymbol = data.currency === "INR" ? "₹" : "$";
  const subject = `Referral Commission Earned — ${curSymbol}${formattedAmount}!`;

  const html = baseEmailTemplate(
    "New Referral Commission",
    `<p>Hi ${data.userName},</p>
     <p>Great news! <strong>${data.referredUserName}</strong> completed their subscription purchase via your referral link.</p>
     <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
       <div style="font-size: 13px; color: #64748b;">Reward Earned: <strong style="color: #10b981; font-size: 16px;">${curSymbol}${formattedAmount}</strong></div>
       <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Status: <strong>Holding (${data.holdingDays} days review period)</strong></div>
     </div>
     <p>Once the cooling-off period completes, these funds will automatically move to your Available balance and can be withdrawn.</p>
     <div style="margin: 24px 0; text-align: center;">
       <a href="${APP_URL}/account/referrals" style="background: #2563eb; color: #ffffff; padding: 10px 20px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px; display: inline-block;">View Wallet & Referrals</a>
     </div>`
  );

  const text = `Hi ${data.userName}, you earned ${curSymbol}${formattedAmount} in referral commission from ${data.referredUserName}.`;

  const sent = await sendEmail({ to: data.toEmail, subject, text, html });
  logEmailDispatch({
    toEmail: data.toEmail,
    subject,
    templateName: "referral_reward_earned",
    status: sent ? "sent" : "failed",
  });
  return sent;
}

export async function sendPayoutRequestedEmail(data: {
  toEmail: string;
  userName: string;
  requestId: string;
  amount: number;
  payoutMethod: string;
  currency: string;
}): Promise<boolean> {
  const formattedAmount = (data.amount / 100).toFixed(2);
  const curSymbol = data.currency === "INR" ? "₹" : "$";
  const subject = `Withdrawal Request Received (${data.requestId})`;

  const html = baseEmailTemplate(
    "Withdrawal Request Under Review",
    `<p>Hi ${data.userName},</p>
     <p>We received your payout request for <strong>${curSymbol}${formattedAmount}</strong>.</p>
     <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
       <div style="font-size: 13px; color: #64748b;">Request ID: <strong style="color: #0f172a;">${data.requestId}</strong></div>
       <div style="font-size: 13px; color: #64748b; margin-top: 4px;">Destination: <strong style="color: #0f172a;">${data.payoutMethod}</strong></div>
       <div style="font-size: 13px; color: #64748b; margin-top: 4px;">Amount: <strong style="color: #0f172a;">${curSymbol}${formattedAmount}</strong></div>
     </div>
     <p>Our accounts team is reviewing your request. You will receive another notification once payment has been released.</p>`
  );

  const text = `Hi ${data.userName}, your payout request for ${curSymbol}${formattedAmount} (${data.requestId}) is under review.`;

  const sent = await sendEmail({ to: data.toEmail, subject, text, html });
  logEmailDispatch({
    toEmail: data.toEmail,
    subject,
    templateName: "payout_requested",
    status: sent ? "sent" : "failed",
  });
  return sent;
}

export async function sendPayoutApprovedEmail(data: {
  toEmail: string;
  userName: string;
  requestId: string;
  amount: number;
  payoutMethod: string;
  reference: string;
  currency: string;
}): Promise<boolean> {
  const formattedAmount = (data.amount / 100).toFixed(2);
  const curSymbol = data.currency === "INR" ? "₹" : "$";
  const subject = `Payout Sent — ${curSymbol}${formattedAmount}`;

  const html = baseEmailTemplate(
    "Payout Successful",
    `<p>Hi ${data.userName},</p>
     <p>Your withdrawal of <strong>${curSymbol}${formattedAmount}</strong> has been processed successfully.</p>
     <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
       <div style="font-size: 13px; color: #64748b;">Amount Transferred: <strong style="color: #10b981; font-size: 16px;">${curSymbol}${formattedAmount}</strong></div>
       <div style="font-size: 13px; color: #64748b; margin-top: 6px;">Sent to: <strong style="color: #0f172a;">${data.payoutMethod}</strong></div>
       <div style="font-size: 13px; color: #64748b; margin-top: 6px;">Bank / UPI Reference (UTR): <strong style="color: #0f172a;">${data.reference}</strong></div>
     </div>
     <p>Thank you for creating and referring with ViPlay Studio!</p>`
  );

  const text = `Hi ${data.userName}, your payout of ${curSymbol}${formattedAmount} has been sent. Ref: ${data.reference}.`;

  const sent = await sendEmail({ to: data.toEmail, subject, text, html });
  logEmailDispatch({
    toEmail: data.toEmail,
    subject,
    templateName: "payout_paid",
    status: sent ? "sent" : "failed",
  });
  return sent;
}

export async function sendPayoutRejectedEmail(data: {
  toEmail: string;
  userName: string;
  requestId: string;
  amount: number;
  reason: string;
  currency: string;
}): Promise<boolean> {
  const formattedAmount = (data.amount / 100).toFixed(2);
  const curSymbol = data.currency === "INR" ? "₹" : "$";
  const subject = `Withdrawal Request Update (${data.requestId})`;

  const html = baseEmailTemplate(
    "Withdrawal Request Notice",
    `<p>Hi ${data.userName},</p>
     <p>Your withdrawal request for <strong>${curSymbol}${formattedAmount}</strong> could not be completed.</p>
     <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 20px 0;">
       <div style="font-size: 13px; color: #991b1b;">Reason: <strong>${data.reason}</strong></div>
     </div>
     <p>The locked funds have been automatically returned to your available wallet balance. You can verify your beneficiary details and try again.</p>
     <div style="margin: 24px 0; text-align: center;">
       <a href="${APP_URL}/account/referrals" style="background: #2563eb; color: #ffffff; padding: 10px 20px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px; display: inline-block;">Check Wallet</a>
     </div>`
  );

  const text = `Hi ${data.userName}, your payout request (${data.requestId}) could not be completed: ${data.reason}. Funds returned to wallet.`;

  const sent = await sendEmail({ to: data.toEmail, subject, text, html });
  logEmailDispatch({
    toEmail: data.toEmail,
    subject,
    templateName: "payout_rejected",
    status: sent ? "sent" : "failed",
  });
  return sent;
}