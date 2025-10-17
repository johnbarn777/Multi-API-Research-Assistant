import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/firebase/auth-context";
import { AppHeader } from "@/components/layout/AppHeader";
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
          <div className="flex min-h-screen flex-col">
            <AppHeader />
            <div className="flex flex-1 flex-col">{children}</div>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
