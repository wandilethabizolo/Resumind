import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOtpAuthUri,
  generateTotpCode,
  generateTotpSecret,
  verifyTotpCode,
} from '../src/server/services/totp.ts';

test('TOTP MFA generation and constant-time verification', () => {
  const secret = generateTotpSecret();
  assert.equal(secret.length, 20);
  const code = generateTotpCode(secret);
  assert.match(code, /^\d{6}$/);
  assert.equal(verifyTotpCode(secret, code), true);
  assert.equal(verifyTotpCode(secret, '000000') && code !== '000000', false);
  const uri = buildOtpAuthUri('admin@resumind.sz', secret);
  assert.ok(uri.startsWith('otpauth://totp/'));
});

test('API unauthorized access, payment removal, and public endpoints (live server)', async (t) => {
  const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
  let reachable = false;
  try {
    const h = await fetch(`${baseUrl}/api/health`);
    reachable = h.ok;
  } catch {
    reachable = false;
  }

  if (!reachable) {
    t.skip('Live server on port 3000 not running during isolated unit run');
    return;
  }

  // 1. Protected endpoints MUST reject unauthenticated requests with 401
  const protectedRoutes = [
    ['GET', '/api/auth/sessions'],
    ['PUT', '/api/profiles/me'],
    ['GET', '/api/network/overview'],
    ['GET', '/api/jobs/applications/me'],
    ['GET', '/api/organizations'],
    ['GET', '/api/conversations'],
    ['GET', '/api/notifications'],
    ['GET', '/api/career/overview'],
    ['POST', '/api/reports'],
  ] as const;

  for (const [method, path] of protectedRoutes) {
    const res = await fetch(`${baseUrl}${path}`, { method });
    assert.equal(res.status, 401, `Expected 401 on ${method} ${path}, got ${res.status}`);
  }

  // 2. Payment/credit and removed admin endpoints MUST NOT exist (404)
  const removedRoutes = [
    '/api/payments/checkout',
    '/api/payments/webhook',
    '/api/wallet',
    '/api/credits/purchase',
    '/api/subscriptions',
    '/api/admin/overview',
  ];
  for (const path of removedRoutes) {
    const res = await fetch(`${baseUrl}${path}`);
    assert.equal(res.status, 404, `Removed route ${path} must return 404, got ${res.status}`);
  }

  // 3. Public read endpoints return 200 and valid array structures
  const jobsRes = await fetch(`${baseUrl}/api/jobs`);
  assert.equal(jobsRes.status, 200);
  const jobsJson = (await jobsRes.json()) as { jobs: unknown[] };
  assert.ok(Array.isArray(jobsJson.jobs));

  const feedRes = await fetch(`${baseUrl}/api/feed`);
  assert.equal(feedRes.status, 200);
  const feedJson = (await feedRes.json()) as { posts: unknown[] };
  assert.ok(Array.isArray(feedJson.posts));
});
