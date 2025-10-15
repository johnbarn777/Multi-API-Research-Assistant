import type { Metadata } from "next";
import { ReactNode } from "react";
import { AuthProvider } from "@/lib/firebase/auth-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Multi-API Research Assistant",
  description:
    "Deep research assistant orchestrating OpenAI Deep Research, Gemini, PDF reports, and email delivery."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100">
        <AuthProvider>
          <div className="min-h-screen">{children}</div>
        </AuthProvider>
      </body>
    </html>
  );
}
