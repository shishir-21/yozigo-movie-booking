#!/usr/bin/env node

import { randomUUID } from 'node:crypto';

const baseUrl = (process.env.API_BASE_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function call(name, path, { method = 'GET', token, body, expectedStatus = 200, expectedCode } = {}) {
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error(`${name}: could not connect to ${baseUrl}; make sure the full-stack Compose app is healthy.`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json() : null;
  if (response.status !== expectedStatus) {
    const code = payload?.error?.code ? ` (API code: ${payload.error.code})` : '';
    throw new Error(`${name}: expected HTTP ${expectedStatus}, received HTTP ${response.status}${code}.`);
  }
  if (expectedCode && payload?.error?.code !== expectedCode) {
    throw new Error(`${name}: expected API error ${expectedCode}, received ${payload?.error?.code ?? 'no error code'}.`);
  }
  console.log(`PASS ${name}`);
  return payload;
}

async function registerCustomer(label) {
  const email = `e2e-${label}-${randomUUID()}@example.com`;
  const password = `E2E-test-${randomUUID()}-Aa1!`;
  const result = await call(`register ${label} customer`, '/api/auth/register', {
    method: 'POST',
    expectedStatus: 201,
    body: { name: `E2E ${label}`, email, password },
  });
  assert(result?.user?.role === 'CUSTOMER' && typeof result?.token === 'string', 'Registration did not return a customer session.');
  return { token: result.token, email, password };
}


async function openSeatEventStream(showId) {
  const controller = new AbortController();
  let response;
  try {
    response = await fetch(`${baseUrl}/api/shows/${encodeURIComponent(showId)}/seat-events`, {
      headers: { accept: 'text/event-stream' },
      signal: controller.signal,
    });
  } catch {
    throw new Error('open live seat event stream: could not connect to the API.');
  }

  const contentType = response.headers.get('content-type') ?? '';
  assert(response.status === 200, `Live seat event stream returned HTTP ${response.status}.`);
  assert(contentType.includes('text/event-stream'), 'Live seat event stream did not return text/event-stream.');
  assert(response.body, 'Live seat event stream returned no response body.');
  console.log('PASS open live seat event stream');
  return { controller, reader: response.body.getReader(), decoder: new TextDecoder(), buffer: '' };
}

async function waitForSeatInvalidation(stream) {
  let timeoutId;
  const readEvent = (async () => {
    while (true) {
      const { done, value } = await stream.reader.read();
      if (done) throw new Error('Live seat event stream closed before an invalidation event arrived.');
      stream.buffer += stream.decoder.decode(value, { stream: true });
      const eventStart = stream.buffer.indexOf('event: seat-map-invalidated');
      if (eventStart < 0) continue;
      const eventEnd = stream.buffer.indexOf('\n\n', eventStart);
      if (eventEnd >= 0) return stream.buffer.slice(eventStart, eventEnd);
    }
  })();

  try {
    const event = await Promise.race([
      readEvent,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('No seat-map invalidation arrived within five seconds of the hold mutation.')), 5000);
      }),
    ]);
    assert(/data:\s*\{\}/.test(event), 'Seat invalidation event should contain an empty JSON payload.');
    assert(!/(email|customer|payment|token)/i.test(event), 'Seat invalidation event exposed data beyond the minimal invalidation signal.');
    console.log('PASS seat hold publishes a minimal live invalidation event');
  } finally {
    clearTimeout(timeoutId);
  }
}

async function main() {
  await call('API and database readiness', '/api/health/ready');

  const owner = await registerCustomer('owner');
  const other = await registerCustomer('other');

  const profile = await call('customer can update their display name', '/api/auth/me', {
    method: 'PATCH',
    token: owner.token,
    expectedStatus: 200,
    body: { name: 'E2E Updated Owner' },
  });
  assert(profile?.user?.name === 'E2E Updated Owner' && profile.user.email === owner.email && profile.user.role === 'CUSTOMER', 'Profile update changed unexpected account fields.');
  const currentUser = await call('updated profile is returned by current-user endpoint', '/api/auth/me', { token: owner.token });
  assert(currentUser?.user?.name === 'E2E Updated Owner', 'The current-user endpoint did not return the updated display name.');
  await call('profile update rejects an invalid display name', '/api/auth/me', {
    method: 'PATCH',
    token: owner.token,
    expectedStatus: 400,
    expectedCode: 'VALIDATION_ERROR',
    body: { name: 'x' },
  });
  await call('password change rejects an incorrect current password', '/api/auth/me/password', {
    method: 'POST',
    token: owner.token,
    expectedStatus: 400,
    expectedCode: 'CURRENT_PASSWORD_INCORRECT',
    body: { currentPassword: 'not-the-current-password', newPassword: `New-E2E-${randomUUID()}-Bb2!` },
  });
  const newPassword = `New-E2E-${randomUUID()}-Bb2!`;
  await call('customer can change their password', '/api/auth/me/password', {
    method: 'POST',
    token: owner.token,
    expectedStatus: 200,
    body: { currentPassword: owner.password, newPassword },
  });
  await call('old password no longer authenticates', '/api/auth/login', {
    method: 'POST',
    expectedStatus: 401,
    expectedCode: 'INVALID_CREDENTIALS',
    body: { email: owner.email, password: owner.password },
  });
  const reauthenticated = await call('new password authenticates successfully', '/api/auth/login', {
    method: 'POST',
    expectedStatus: 200,
    body: { email: owner.email, password: newPassword },
  });
  assert(reauthenticated?.user?.name === 'E2E Updated Owner' && reauthenticated?.user?.role === 'CUSTOMER', 'Login with the new password returned unexpected account data.');
  owner.token = reauthenticated.token;
  owner.password = newPassword;

  const catalogue = await call('browse movie catalogue', '/api/movies');
  assert(Array.isArray(catalogue?.movies) && catalogue.movies.length > 0, 'No seeded demo movies were returned.');

  let selectedMovie;
  let selectedShow;
  for (const movie of catalogue.movies) {
    const showResponse = await call(`load showtimes for ${movie.title}`, `/api/movies/${encodeURIComponent(movie.id)}/shows`);
    if (showResponse?.shows?.length) {
      selectedMovie = movie;
      selectedShow = showResponse.shows[0];
      break;
    }
  }
  assert(selectedMovie && selectedShow, 'No upcoming seeded showtime was found. Run the demo seed and retry.');

  const seatMap = await call('load show seat map', `/api/shows/${encodeURIComponent(selectedShow.id)}/seats`);
  const seat = seatMap?.seats?.find((candidate) => candidate.status === 'AVAILABLE');
  assert(seat?.id, 'The selected show has no available seats.');

  const reportPath = `/api/admin/shows/${encodeURIComponent(selectedShow.id)}/report`;
  await call('admin analytics rejects unauthenticated requests', '/api/admin/analytics', {
    expectedStatus: 401,
    expectedCode: 'UNAUTHORIZED',
  });
  await call('customer cannot access admin analytics', '/api/admin/analytics', {
    token: owner.token,
    expectedStatus: 403,
    expectedCode: 'FORBIDDEN',
  });
  await call('admin show report rejects unauthenticated requests', reportPath, {
    expectedStatus: 401,
    expectedCode: 'UNAUTHORIZED',
  });
  await call('customer cannot access an admin show report', reportPath, {
    token: owner.token,
    expectedStatus: 403,
    expectedCode: 'FORBIDDEN',
  });

  await call('hold request rejects a missing seat ID', `/api/shows/${encodeURIComponent(selectedShow.id)}/holds`, {
    method: 'POST',
    token: owner.token,
    expectedStatus: 400,
    expectedCode: 'VALIDATION_ERROR',
    body: {},
  });

    const seatEvents = await openSeatEventStream(selectedShow.id);
  let holdResponse;
  try {
    holdResponse = await call('owner holds an available seat', `/api/shows/${encodeURIComponent(selectedShow.id)}/holds`, {
      method: 'POST',
      token: owner.token,
      expectedStatus: 201,
      body: { seatId: seat.id },
    });
    await waitForSeatInvalidation(seatEvents);
  } finally {
    seatEvents.controller.abort();
    await seatEvents.reader.cancel().catch(() => {});
  }
  const holdId = holdResponse?.hold?.id;
  assert(holdId, 'The hold endpoint did not return a hold ID.');
  const repeatedHold = await call('repeating a hold request reuses the same active hold', `/api/shows/${encodeURIComponent(selectedShow.id)}/holds`, {
    method: 'POST',
    token: owner.token,
    expectedStatus: 201,
    body: { seatId: seat.id },
  });
  assert(repeatedHold?.hold?.id === holdId, 'Repeating the same hold request created a duplicate hold.');

  await call('competing customer cannot hold the same seat', `/api/shows/${encodeURIComponent(selectedShow.id)}/holds`, {
    method: 'POST',
    token: other.token,
    expectedStatus: 409,
    expectedCode: 'SEAT_UNAVAILABLE',
    body: { seatId: seat.id },
  });

  await call('declined mock payment creates no booking', `/api/shows/${encodeURIComponent(selectedShow.id)}/bookings`, {
    method: 'POST',
    token: owner.token,
    expectedStatus: 402,
    expectedCode: 'MOCK_PAYMENT_DECLINED',
    body: { holdId, mockPaymentResult: 'DECLINED' },
  });
  const beforeCheckout = await call('booking history is empty before successful checkout', '/api/bookings/me', { token: owner.token });
  assert(Array.isArray(beforeCheckout?.bookings) && beforeCheckout.bookings.length === 0, 'A declined mock payment unexpectedly created a booking.');

  const checkout = await call('confirm booking with mock payment', `/api/shows/${encodeURIComponent(selectedShow.id)}/bookings`, {
    method: 'POST',
    token: owner.token,
    expectedStatus: 201,
    body: { holdId, mockPaymentResult: 'SUCCESS' },
  });
  const booking = checkout?.booking;
  assert(booking?.id && booking.status === 'CONFIRMED', 'Checkout did not return a confirmed booking.');
  assert(checkout?.payment?.mode === 'MOCK', 'Checkout did not identify payment as simulated.');
  assert(booking.seats?.some((entry) => entry.id === seat.id), 'Confirmed booking does not include the held seat.');

  const retry = await call('checkout retry is idempotent', `/api/shows/${encodeURIComponent(selectedShow.id)}/bookings`, {
    method: 'POST',
    token: owner.token,
    expectedStatus: 200,
    body: { holdId, mockPaymentResult: 'SUCCESS' },
  });
  assert(retry?.booking?.id === booking.id && retry?.alreadyConfirmed === true, 'Checkout retry created or returned a different booking.');

  const history = await call('booking appears in customer history', '/api/bookings/me', { token: owner.token });
  assert(history?.bookings?.some((entry) => entry.id === booking.id && entry.status === 'CONFIRMED'), 'Confirmed booking was missing from customer history.');

  await call('another customer cannot cancel this booking', `/api/bookings/${encodeURIComponent(booking.id)}/cancel`, {
    method: 'POST',
    token: other.token,
    expectedStatus: 404,
    expectedCode: 'BOOKING_NOT_FOUND',
  });

  await call('booking owner can cancel eligible booking', `/api/bookings/${encodeURIComponent(booking.id)}/cancel`, {
    method: 'POST',
    token: owner.token,
    expectedStatus: 200,
  });

  const releasedMap = await call('cancelled booking releases the seat', `/api/shows/${encodeURIComponent(selectedShow.id)}/seats`);
  assert(releasedMap?.seats?.some((candidate) => candidate.id === seat.id && candidate.status === 'AVAILABLE'), 'Seat was not available after cancellation.');

  const newHold = await call('second customer can hold the released seat', `/api/shows/${encodeURIComponent(selectedShow.id)}/holds`, {
    method: 'POST',
    token: other.token,
    expectedStatus: 201,
    body: { seatId: seat.id },
  });
  const newHoldId = newHold?.hold?.id;
  assert(newHoldId, 'Second customer did not receive a hold ID.');

  await call('hold ownership prevents another customer releasing it', `/api/shows/${encodeURIComponent(selectedShow.id)}/holds/${encodeURIComponent(newHoldId)}`, {
    method: 'DELETE',
    token: owner.token,
    expectedStatus: 404,
    expectedCode: 'HOLD_NOT_FOUND',
  });
  await call('hold owner can release their hold', `/api/shows/${encodeURIComponent(selectedShow.id)}/holds/${encodeURIComponent(newHoldId)}`, {
    method: 'DELETE',
    token: other.token,
    expectedStatus: 200,
  });

  const finalMap = await call('released hold makes the seat available', `/api/shows/${encodeURIComponent(selectedShow.id)}/seats`);
  assert(finalMap?.seats?.some((candidate) => candidate.id === seat.id && candidate.status === 'AVAILABLE'), 'Seat was not available after hold release.');

  const multiSeatMap = await call('load seats for multi-seat checkout', `/api/shows/${encodeURIComponent(selectedShow.id)}/seats`);
  const multiSeats = multiSeatMap?.seats?.filter((candidate) => candidate.status === 'AVAILABLE').slice(0, 2) ?? [];
  assert(multiSeats.length === 2, 'The selected show needs at least two available seats for multi-seat checkout.');
  const multiHoldIds = [];
  for (const [index, candidate] of multiSeats.entries()) {
    const held = await call(`owner holds multi-seat checkout seat ${index + 1}`, `/api/shows/${encodeURIComponent(selectedShow.id)}/holds`, {
      method: 'POST',
      token: owner.token,
      expectedStatus: 201,
      body: { seatId: candidate.id },
    });
    assert(held?.hold?.id, `Multi-seat hold ${index + 1} did not return a hold ID.`);
    multiHoldIds.push(held.hold.id);
  }

  await call('multi-seat checkout rejects duplicate hold IDs', `/api/shows/${encodeURIComponent(selectedShow.id)}/bookings`, {
    method: 'POST',
    token: owner.token,
    expectedStatus: 400,
    expectedCode: 'VALIDATION_ERROR',
    body: { holdIds: [multiHoldIds[0], multiHoldIds[0]], mockPaymentResult: 'SUCCESS' },
  });

  const multiCheckout = await call('confirm a two-seat booking with mock payment', `/api/shows/${encodeURIComponent(selectedShow.id)}/bookings`, {
    method: 'POST',
    token: owner.token,
    expectedStatus: 201,
    body: { holdIds: multiHoldIds, mockPaymentResult: 'SUCCESS' },
  });
  const multiBooking = multiCheckout?.booking;
  assert(multiBooking?.id && multiBooking.status === 'CONFIRMED', 'Multi-seat checkout did not return a confirmed booking.');
  assert(multiCheckout?.payment?.mode === 'MOCK', 'Multi-seat checkout did not identify payment as simulated.');
  assert(multiBooking.seats?.length === 2, 'Multi-seat checkout did not confirm exactly two seats.');
  assert(multiSeats.every((candidate) => multiBooking.seats.some((entry) => entry.id === candidate.id)), 'Multi-seat booking did not include both held seats.');
  assert(multiBooking.amountPaise === selectedShow.pricePaise * 2, 'Multi-seat booking total does not equal the show price multiplied by two seats.');

  const multiRetry = await call('multi-seat checkout retry is idempotent', `/api/shows/${encodeURIComponent(selectedShow.id)}/bookings`, {
    method: 'POST',
    token: owner.token,
    expectedStatus: 200,
    body: { holdIds: multiHoldIds, mockPaymentResult: 'SUCCESS' },
  });
  assert(multiRetry?.booking?.id === multiBooking.id && multiRetry?.alreadyConfirmed === true, 'Multi-seat checkout retry created or returned a different booking.');

  await call('owner can cancel the multi-seat booking', `/api/bookings/${encodeURIComponent(multiBooking.id)}/cancel`, {
    method: 'POST',
    token: owner.token,
    expectedStatus: 200,
  });
  const afterMultiCancel = await call('multi-seat cancellation releases both seats', `/api/shows/${encodeURIComponent(selectedShow.id)}/seats`);
  assert(multiSeats.every((candidate) => afterMultiCancel?.seats?.some((entry) => entry.id === candidate.id && entry.status === 'AVAILABLE')), 'Cancelling a multi-seat booking did not release every seat.');

  const atomicitySeats = afterMultiCancel?.seats?.filter((candidate) => candidate.status === 'AVAILABLE').slice(0, 2) ?? [];
  assert(atomicitySeats.length === 2, 'Two available seats are required to verify failed multi-seat checkout atomicity.');
  const atomicityHoldIds = [];
  for (const [index, candidate] of atomicitySeats.entries()) {
    const held = await call(`owner holds atomicity test seat ${index + 1}`, `/api/shows/${encodeURIComponent(selectedShow.id)}/holds`, {
      method: 'POST',
      token: owner.token,
      expectedStatus: 201,
      body: { seatId: candidate.id },
    });
    assert(held?.hold?.id, `Atomicity test hold ${index + 1} did not return a hold ID.`);
    atomicityHoldIds.push(held.hold.id);
  }

  await call('release one hold before multi-seat checkout', `/api/shows/${encodeURIComponent(selectedShow.id)}/holds/${encodeURIComponent(atomicityHoldIds[0])}`, {
    method: 'DELETE',
    token: owner.token,
    expectedStatus: 200,
  });
  await call('multi-seat checkout rejects a released hold atomically', `/api/shows/${encodeURIComponent(selectedShow.id)}/bookings`, {
    method: 'POST',
    token: owner.token,
    expectedStatus: 409,
    expectedCode: 'HOLD_EXPIRED',
    body: { holdIds: atomicityHoldIds, mockPaymentResult: 'SUCCESS' },
  });
  const afterAtomicFailure = await call('seat map remains consistent after rejected multi-seat checkout', `/api/shows/${encodeURIComponent(selectedShow.id)}/seats`);
  assert(afterAtomicFailure?.seats?.some((candidate) => candidate.id === atomicitySeats[0].id && candidate.status === 'AVAILABLE'), 'The previously released seat was not available after failed checkout.');
  assert(afterAtomicFailure?.seats?.some((candidate) => candidate.id === atomicitySeats[1].id && candidate.status !== 'AVAILABLE'), 'The other active hold was unexpectedly released by failed checkout.');
  const historyAfterAtomicFailure = await call('failed multi-seat checkout creates no partial booking', '/api/bookings/me', { token: owner.token });
  assert(!historyAfterAtomicFailure?.bookings?.some((entry) => entry.status === 'CONFIRMED' && entry.seats?.some((bookedSeat) => atomicitySeats.some((candidate) => candidate.id === bookedSeat.id))), 'A failed multi-seat checkout unexpectedly created a confirmed booking.');
  await call('owner can release remaining atomicity-test hold', `/api/shows/${encodeURIComponent(selectedShow.id)}/holds/${encodeURIComponent(atomicityHoldIds[1])}`, {
    method: 'DELETE',
    token: owner.token,
    expectedStatus: 200,
  });
  const finalAtomicityMap = await call('atomicity-test seats are available after cleanup', `/api/shows/${encodeURIComponent(selectedShow.id)}/seats`);
  assert(atomicitySeats.every((candidate) => finalAtomicityMap?.seats?.some((entry) => entry.id === candidate.id && entry.status === 'AVAILABLE')), 'Atomicity test cleanup did not release all seats.');

  console.log(`All booking lifecycle, account security, and multi-seat E2E checks passed against ${baseUrl}. Payment remains simulated; no real money was charged.`);
}

main().catch((error) => {
  console.error(`E2E lifecycle failed: ${error instanceof Error ? error.message : 'unexpected error'}`);
  process.exitCode = 1;
});
