/**
 * Simple circuit breaker for remote node operations.
 *
 * States:
 *   CLOSED  → normal operation, failures increment counter
 *   OPEN    → all calls rejected immediately, wait for cooldown
 *   HALF_OPEN → one probe allowed; success → CLOSED, failure → OPEN
 */

export type CircuitState = "closed" | "open" | "half_open";

interface CircuitEntry {
  state: CircuitState;
  failures: number;
  lastFailure: number;
  lastSuccess: number;
}

const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_COOLDOWN_MS = 60_000; // 1 min

const circuits = new Map<string, CircuitEntry>();

function getEntry(key: string): CircuitEntry {
  let entry = circuits.get(key);
  if (!entry) {
    entry = { state: "closed", failures: 0, lastFailure: 0, lastSuccess: 0 };
    circuits.set(key, entry);
  }
  return entry;
}

/** Check if a call is allowed. Returns false if the circuit is open. */
export function isCallAllowed(
  key: string,
  cooldownMs = DEFAULT_COOLDOWN_MS,
): boolean {
  const entry = getEntry(key);

  if (entry.state === "closed") return true;

  if (entry.state === "open") {
    if (Date.now() - entry.lastFailure >= cooldownMs) {
      entry.state = "half_open";
      return true;
    }
    return false;
  }

  // half_open: already allowed one probe, block further until result
  return false;
}

/** Record a successful call. Resets the circuit to closed. */
export function recordSuccess(key: string): void {
  const entry = getEntry(key);
  entry.state = "closed";
  entry.failures = 0;
  entry.lastSuccess = Date.now();
}

/** Record a failed call. Opens the circuit after threshold. */
export function recordFailure(
  key: string,
  threshold = DEFAULT_FAILURE_THRESHOLD,
): void {
  const entry = getEntry(key);
  entry.failures++;
  entry.lastFailure = Date.now();

  if (entry.failures >= threshold) {
    entry.state = "open";
  }
}

/** Get the current state of a circuit (for monitoring). */
export function getCircuitState(key: string): CircuitEntry | undefined {
  return circuits.get(key);
}

/** Get all circuit states (for health endpoint). */
export function getAllCircuitStates(): Record<string, CircuitEntry> {
  return Object.fromEntries(circuits);
}

/** Reset a specific circuit (e.g. after manual fix). */
export function resetCircuit(key: string): void {
  circuits.delete(key);
}

/** Reset all circuits. Called on shutdown/tests. */
export function resetAllCircuits(): void {
  circuits.clear();
}
