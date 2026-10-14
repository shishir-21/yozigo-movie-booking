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
  const result = await call(`register ${label} customer`, '/api/auth/register', {
    method: 'POST',
    expectedStatus: 201,
    body: { name: `E2E ${label}`, email, password: `E2E-test-${randomUUID()}-Aa1!` },
  });
  assert(result?.user?.role === 'CUSTOMER' && typeof result?.token === 'string', 'Registration did not return a customer session.');
  return { token: result.token };
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

  console.log(`All booking lifecycle E2E checks passed against ${baseUrl}. Payment remains simulated; no real money was charged.`);
}

main().catch((error) => {
  console.error(`E2E lifecycle failed: ${error instanceof Error ? error.message : 'unexpected error'}`);
  process.exitCode = 1;
});
