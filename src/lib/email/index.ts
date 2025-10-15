import { sendWithGmail, type GmailTokens } from "./gmail";
import { sendWithSendgrid } from "./sendgrid";

export type EmailPayload = {
  to: string;
  subject: string;
  body: string;
  pdfBuffer: Buffer;
  gmailTokens?: GmailTokens | null;
};

export async function sendResearchReport(payload: EmailPayload) {
  if (payload.gmailTokens) {
    const gmailResult = await sendWithGmail({
      to: payload.to,
      subject: payload.subject,
      body: payload.body,
      pdfBuffer: payload.pdfBuffer,
      tokens: payload.gmailTokens
    });

    if (gmailResult.ok) {
      return { provider: "gmail", ...gmailResult };
    }
  }

  const fallbackResult = await sendWithSendgrid({
    to: payload.to,
    subject: payload.subject,
    body: payload.body,
    pdfBuffer: payload.pdfBuffer
  });

  return { provider: "sendgrid", ...fallbackResult };
}
