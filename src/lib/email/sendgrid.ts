import sgMail from "@sendgrid/mail";
import { getServerEnv } from "@/config/env";
import { logger } from "@/lib/utils/logger";

export async function sendWithSendgrid({
  to,
  subject,
  body,
  pdfBuffer
}: {
  to: string;
  subject: string;
  body: string;
  pdfBuffer: Buffer;
}) {
  const env = getServerEnv();
  const apiKey = env.SENDGRID_API_KEY;

  if (!apiKey) {
    return {
      ok: false,
      reason: "SENDGRID_API_KEY not configured"
    };
  }

  sgMail.setApiKey(apiKey);

  // TODO: send the email with the PDF attachment.
  logger.warn("email.sendgrid.not_implemented", {
    to,
    subject,
    bodyLength: body.length,
    attachmentBytes: pdfBuffer.byteLength
  });
  return {
    ok: false,
    reason: "Not implemented"
  };
}
