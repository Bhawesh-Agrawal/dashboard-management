/**
 * Injectable clock abstraction for deterministic time simulation.
 *
 * In non-production environments (NODE_ENV !== "production" AND DEPLOY_ENV !== "production"),
 * this allows setting a simulated "now" timestamp for time travel (e.g., testing notification
 * triggers, morning/evening briefs, attendance, and scheduled crons).
 *
 * In production, simulated time is strictly rejected and ignored: getNow() always delegates
 * to the real system clock (new Date()).
 */

let simulatedTime: Date | null = null;

/**
 * Returns true if the environment is strictly production.
 */
export function isProductionEnv(): boolean {
  return process.env.NODE_ENV === "production" || process.env.DEPLOY_ENV === "production";
}

/**
 * Returns the current time as a Date object.
 * Returns the simulated time in non-production environments if set;
 * otherwise returns a fresh real-time Date instance.
 */
export function getNow(): Date {
  if (!isProductionEnv() && simulatedTime !== null) {
    return new Date(simulatedTime.getTime());
  }
  return new Date();
}

/**
 * Returns the current time as a millisecond timestamp.
 */
export function getNowMs(): number {
  return getNow().getTime();
}

/**
 * Returns the current time formatted as an ISO string.
 */
export function getNowIso(): string {
  return getNow().toISOString();
}

/**
 * Sets simulated time.
 * In production environments, this throws an error to prevent accidental time spoofing.
 */
export function setSimulatedTime(time: string | Date | null): void {
  if (isProductionEnv()) {
    throw new Error("Simulated clock cannot be set in production environment.");
  }
  if (time === null) {
    simulatedTime = null;
    return;
  }
  const date = typeof time === "string" ? new Date(time) : time;
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date provided to setSimulatedTime: ${time}`);
  }
  simulatedTime = new Date(date.getTime());
}

/**
 * Resets the clock to use real system time.
 */
export function resetClock(): void {
  simulatedTime = null;
}

/**
 * Checks whether the clock is currently running on simulated time.
 */
export function isSimulated(): boolean {
  if (isProductionEnv()) return false;
  return simulatedTime !== null;
}
