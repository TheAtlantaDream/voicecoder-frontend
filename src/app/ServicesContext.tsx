import type { ReactNode } from "react";
import { ServicesContext, type Services } from "./contexts";

/** Provides the (real or fake) services chosen in main.tsx to SessionProvider. */
export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <ServicesContext value={services}>{children}</ServicesContext>;
}
