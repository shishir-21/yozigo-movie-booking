import { describe, expect, it } from 'vitest';
import { ApiError } from './auth-client';
import { AMBIGUOUS_CHECKOUT_MESSAGE, getCheckoutRecoveryMessage } from './checkout-recovery';

describe('checkout recovery guidance', () => {
  it('warns that a timed-out checkout may have completed', () => {
    expect(getCheckoutRecoveryMessage(new ApiError('Timed out', 0, 'REQUEST_TIMEOUT')))
      .toBe(AMBIGUOUS_CHECKOUT_MESSAGE);
  });

  it('uses the same safe guidance when the connection drops', () => {
    expect(getCheckoutRecoveryMessage(new ApiError('Offline', 0, 'NETWORK_ERROR')))
      .toBe(AMBIGUOUS_CHECKOUT_MESSAGE);
  });

  it('does not treat definitive API errors as ambiguous', () => {
    expect(getCheckoutRecoveryMessage(new ApiError('Seat unavailable', 409, 'SEAT_UNAVAILABLE'))).toBeNull();
    expect(getCheckoutRecoveryMessage(new Error('Unexpected error'))).toBeNull();
  });
});
