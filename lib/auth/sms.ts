import "server-only";

export async function sendOtpSms(phoneNumber: string, code: string): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  // 1. Twilio SMS
  if (accountSid && authToken && fromNumber) {
    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const authHeader = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");

      const body = new URLSearchParams({
        To: phoneNumber,
        From: fromNumber,
        Body: `Your ViPlay Studio verification code is ${code}. Valid for 10 minutes. Do not share this code.`,
      });

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("Twilio API error:", res.status, errText);
        return false;
      }

      return true;
    } catch (err) {
      console.error("Failed to send SMS via Twilio:", err);
      return false;
    }
  }

  // 2. Development / Local Testing Fallback
  console.log("\n================ [SMS DISPATCHER (DEV)] ================");
  console.log(`To:    ${phoneNumber}`);
  console.log(`Code:  [ ${code} ]`);
  console.log(`Msg:   Your ViPlay Studio verification code is ${code}. (Expires in 10 minutes)`);
  console.log("========================================================\n");
  return true;
}

/**
 * Validates E.164 international phone number format (+[1-9][0-9]{6,14}).
 */
export function isValidE164Phone(phone: string): boolean {
  if (typeof phone !== "string") return false;
  const trimmed = phone.trim();
  const e164Regex = /^\+[1-9]\d{6,14}$/;
  return e164Regex.test(trimmed);
}
