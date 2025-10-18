import { getServerEnv } from "@/config/env";

export function isDemoMode(): boolean {
  return getServerEnv().DEMO_MODE === true;
}
