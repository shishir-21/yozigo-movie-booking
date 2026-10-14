import { describe, expect, it } from 'vitest';
import { ApiError } from './auth-client';
import { AMBIGUOUS_CANCELLATION_MESSAGE, getCancellationRecoveryMessage } from './cancellation-recovery';

describe('cancellation recovery guidance', () => {
  it('warns that a timed-out cancellation may have completed', () => {
    expect(getCancellationRecoveryMessage(new ApiError('Timed out', 0, 'REQUEST_TIMEOUT')))
      .toBe(AMBIGUOUS_CANCELLATION_MESSAGE);
  });

  it('uses the same safe guidance when the connection drops', () => {
    expect(getCancellationRecoveryMessage(new ApiError('Offline', 0, 'NETWORK_ERROR')))
      .toBe(AMBIGUOUS_CANCELLATION_MESSAGE);
  });

  it('does not treat definitive API errors as ambiguous', () => {
    expect(getCancellationRecoveryMessage(new ApiError('Too late to cancel', 409, 'CANCELLATION_CUTOFF'))).toBeNull();
    expect(getCancellationRecoveryMessage(new Error('Unexpected error'))).toBeNull();
  });
});
