/**
 * TypesenseBreaker — Resilience logic for the Search Engine.
 * 
 * Prevents slamming a failing Typesense instance and provides 
 * instant failover to Firestore.
 */

export enum BreakerState {
  CLOSED, // Normal operation
  OPEN,   // Typesense is failing, use Fallback
  HALF_OPEN // Testing if Typesense is back
}

export class TypesenseBreaker {
  private static failureCount = 0;
  private static lastFailureTime: number | null = null;
  private static state: BreakerState = BreakerState.CLOSED;

  private static readonly FAILURE_THRESHOLD = 3;
  private static readonly COOLDOWN_MS = 120_000; // 2 minutes

  /**
   * Checks if Typesense is allowed to be called.
   */
  static isOpen(): boolean {
    this.updateState();
    return this.state === BreakerState.OPEN;
  }

  /**
   * Records a success and potentially closes the breaker.
   */
  static recordSuccess() {
    this.failureCount = 0;
    this.state = BreakerState.CLOSED;
    this.lastFailureTime = null;
  }

  /**
   * Records a failure and potentially opens the breaker.
   */
  static recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.FAILURE_THRESHOLD) {
      console.error(`[CircuitBreaker] Opening for Typesense after ${this.failureCount} failures.`);
      this.state = BreakerState.OPEN;
    }
  }

  /**
   * State machine logic to handle cooldowns.
   */
  private static updateState() {
    if (this.state === BreakerState.OPEN && this.lastFailureTime) {
      const now = Date.now();
      if (now - this.lastFailureTime > this.COOLDOWN_MS) {
        console.info('[CircuitBreaker] Transitioning to HALF_OPEN for Typesense.');
        this.state = BreakerState.HALF_OPEN;
      }
    }
  }

  static getState(): string {
    return BreakerState[this.state];
  }
}
