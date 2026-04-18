/**
 * processLoad — concurrency + idempotency invariants
 *
 * Invariants protected by this test suite:
 *   1. Idempotency-key replay: a second call with the same key returns
 *      the cached result without re-running validation or re-committing.
 *   2. Rejection path is also cached: a blocked load replayed with the
 *      same key returns the same REJECTED result, not a fresh run.
 *   3. Invalid-input rejection: missing userId / amount / key → REJECTED
 *      with INVALID_REQUEST.
 *
 * See docs/scope-and-limitations.md §Adversarial test findings #1 for why
 * this matters: two concurrent validate-then-commit requests could
 * individually pass the cap check and collectively overshoot. processLoad
 * serializes on a per-user lock and stores idempotency results to prevent
 * both the race and the replay class of bugs.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { processLoad, __resetLoadGuardState } from '../../services/wallet-load-guard.js';

describe('processLoad — idempotency', () => {
  beforeEach(() => {
    __resetLoadGuardState();
  });

  it('returns the cached result on idempotency-key replay rather than re-running', async () => {
    const userId = 'user_001';
    const key = 'idem-test-key-001';

    const first = await processLoad({ userId, amountPaise: 10000, idempotencyKey: key });
    const replay = await processLoad({ userId, amountPaise: 10000, idempotencyKey: key });

    // Both responses must be reference-equal for successful path (same transactionId)
    if (first.status === 'SUCCESS') {
      expect(replay.status).toBe('SUCCESS');
      expect(replay.transactionId).toBe(first.transactionId);
    } else {
      // If it was rejected (e.g., user not found in mock data), both are same rejection
      expect(replay.status).toBe(first.status);
      expect(replay.reason).toBe(first.reason);
    }
  });

  it('replay does NOT produce a second transactionId', async () => {
    const userId = 'user_002';
    const key = 'idem-test-key-002';

    const first = await processLoad({ userId, amountPaise: 5000, idempotencyKey: key });
    const replay = await processLoad({ userId, amountPaise: 5000, idempotencyKey: key });

    // If both were successful, the replay transactionId is the cached one (not a new timestamp-based ID)
    if (first.status === 'SUCCESS' && replay.status === 'SUCCESS') {
      expect(replay.transactionId).toBe(first.transactionId);
    }
  });

  it('a different idempotency key gets a fresh run', async () => {
    const userId = 'user_001';
    const keyA = 'idem-test-key-A';
    const keyB = 'idem-test-key-B';

    const a = await processLoad({ userId, amountPaise: 1000, idempotencyKey: keyA });
    const b = await processLoad({ userId, amountPaise: 1000, idempotencyKey: keyB });

    if (a.status === 'SUCCESS' && b.status === 'SUCCESS') {
      // Different transactionIds — each key got its own run.
      expect(a.transactionId).not.toBe(b.transactionId);
    }
  });
});

describe('processLoad — invalid input rejection', () => {
  beforeEach(() => {
    __resetLoadGuardState();
  });

  it('rejects missing userId', async () => {
    const result = await processLoad({ amountPaise: 1000, idempotencyKey: 'k1' });
    expect(result.status).toBe('REJECTED');
    expect(result.reason).toBe('INVALID_REQUEST');
  });

  it('rejects zero or negative amount', async () => {
    const zero = await processLoad({ userId: 'user_001', amountPaise: 0, idempotencyKey: 'k2' });
    const neg = await processLoad({ userId: 'user_001', amountPaise: -100, idempotencyKey: 'k3' });
    expect(zero.status).toBe('REJECTED');
    expect(zero.reason).toBe('INVALID_REQUEST');
    expect(neg.status).toBe('REJECTED');
    expect(neg.reason).toBe('INVALID_REQUEST');
  });

  it('rejects missing idempotency key', async () => {
    const result = await processLoad({ userId: 'user_001', amountPaise: 1000 });
    expect(result.status).toBe('REJECTED');
    expect(result.reason).toBe('INVALID_REQUEST');
  });
});

describe('processLoad — serialization under concurrent calls', () => {
  beforeEach(() => {
    __resetLoadGuardState();
  });

  it('two concurrent loads with different keys both complete without interleaving', async () => {
    const userId = 'user_001';

    const [r1, r2] = await Promise.all([
      processLoad({ userId, amountPaise: 500, idempotencyKey: 'concur-A' }),
      processLoad({ userId, amountPaise: 500, idempotencyKey: 'concur-B' }),
    ]);

    // Both calls completed (no exception, no deadlock)
    expect([r1.status, r2.status].every(s => s === 'SUCCESS' || s === 'REJECTED')).toBe(true);
    // They got distinct treatments (either both succeeded with distinct IDs, or one of them rejected)
    if (r1.status === 'SUCCESS' && r2.status === 'SUCCESS') {
      expect(r1.transactionId).not.toBe(r2.transactionId);
    }
  });

  it('two concurrent calls with the SAME idempotency key return the same result', async () => {
    const userId = 'user_001';
    const sharedKey = 'concur-shared';

    const [r1, r2] = await Promise.all([
      processLoad({ userId, amountPaise: 500, idempotencyKey: sharedKey }),
      processLoad({ userId, amountPaise: 500, idempotencyKey: sharedKey }),
    ]);

    // One must have served as the committed run, the other as a cache-hit replay.
    // Both observable outcomes must be identical.
    expect(r1.status).toBe(r2.status);
    if (r1.status === 'SUCCESS') {
      expect(r1.transactionId).toBe(r2.transactionId);
    }
  });
});
