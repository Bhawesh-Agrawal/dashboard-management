import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request-scoped storage for simulated time.
 * Uses Node's AsyncLocalStorage so simulated time only exists for the duration of the
 * asynchronous execution context running inside `withSimulatedTime()`.
 *
 * There is NO module-level mutable time.
 */
const clockStorage = new AsyncLocalStorage<Date>();

/**
 * Returns true if the environment is strictly production.
 */
export function isProductionEnv(): boolean {
  return process.env.NODE_ENV === "production" || process.env.DEPLOY_ENV === "production";
}

/**
 * Returns the current time as a Date object.
 * In non-production, returns the request-scoped simulated time if running inside `withSimulatedTime()`;
 * otherwise returns a fresh real-time Date instance.
 * In production, always returns a fresh real-time Date instance.
 */
export function getNow(): Date {
  if (!isProductionEnv()) {
    const simulated = clockStorage.getStore();
    if (simulated) {
      return new Date(simulated.getTime());
    }
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
 * Checks whether the current async execution context is running on simulated time.
 */
export function isSimulated(): boolean {
  if (isProductionEnv()) return false;
  return clockStorage.getStore() !== undefined;
}

/**
 * Runs an asynchronous or synchronous function within a request-scoped simulated time context.
 * In production environments, this throws an error to prevent accidental time spoofing.
 *
 * AsyncLocalStorage ensures that:
 * 1. Concurrent requests never affect each other.
 * 2. Time is cleaned up automatically when the function finishes or throws.
 */
export async function withSimulatedTime<T>(
  time: string | Date,
  fn: () => Promise<T> | T
): Promise<T> {
  if (isProductionEnv()) {
    throw new Error("Simulated clock cannot be set in production environment.");
  }
  const date = typeof time === "string" ? new Date(time) : time;
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date provided to withSimulatedTime: ${time}`);
  }

  return clockStorage.run(new Date(date.getTime()), async () => {
    try {
      return await fn();
    } finally {
      // AsyncLocalStorage scope ends automatically when run() completes
    }
  });
}
