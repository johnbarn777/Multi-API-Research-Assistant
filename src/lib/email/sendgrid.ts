import sgMail from "@sendgrid/mail";
import { getEnv } from "@/config/env";

export async function sendWithSendgrid(_: {
  to: string;
  subject: string;
  body: string;
  pdfBuffer: Buffer;
}) {
  const env = getEnv();
  const apiKey = env.SENDGRID_API_KEY;

  if (!apiKey) {
    return {
      ok: false,
      reason: "SENDGRID_API_KEY not configured"
    };
  }

  sgMail.setApiKey(apiKey);

  // TODO: send the email with the PDF attachment.
  return {
    ok: false,
    reason: "Not implemented"
  };
}
