import { google } from "googleapis";
import { getServerEnv } from "@/config/env";

export type GmailTokens = {
  access_token: string;
  refresh_token: string;
  expiry_date?: number;
  scope?: string;
};

export async function sendWithGmail(_: {
  to: string;
  subject: string;
  body: string;
  pdfBuffer: Buffer;
  tokens: GmailTokens;
}) {
  const env = getServerEnv();
  const oauth2Client = new google.auth.OAuth2(
    env.GOOGLE_OAUTH_CLIENT_ID,
    env.GOOGLE_OAUTH_CLIENT_SECRET,
    env.GOOGLE_OAUTH_REDIRECT_URI
  );

  // TODO: set credentials and send RFC822 message using gmail.users.messages.send.
  return {
    ok: false,
    reason: "Not implemented"
  };
}
