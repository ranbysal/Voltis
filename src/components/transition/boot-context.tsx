"use client";

import { createContext, useContext } from "react";
import { type BootPhase, phaseAtLeast } from "./boot-config";

export type BootState = {
  /** True while the boot choreography owns the dashboard. */
  active: boolean;
  phase: BootPhase;
};

const BootContext = createContext<BootState>({ active: false, phase: "done" });

export const BootProvider = BootContext.Provider;

export function useBoot() {
  return useContext(BootContext);
}

/** True when the boot sequence has reached (or passed) `target`. */
export function useBootPhase(target: BootPhase) {
  const boot = useBoot();
  return !boot.active || phaseAtLeast(boot.phase, target);
}
