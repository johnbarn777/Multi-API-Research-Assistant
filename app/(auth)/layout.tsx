import type { ReactNode } from "react";
import { AuthStateGate } from "@/components/auth/AuthStateGate";

export default function AuthGroupLayout({
  children
}: {
  children: ReactNode;
}): JSX.Element {
  return <AuthStateGate>{children}</AuthStateGate>;
}
