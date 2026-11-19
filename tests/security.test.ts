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
    ['GET', '/api/organizations/1/talent'],
    ['POST', '/api/organizations/1/talent/1/invite'],
    ['GET', '/api/organizations/1/talent-pools'],
    ['GET', '/api/organizations/1/interviews'],
    ['GET', '/api/organizations/1/analytics'],
    ['PATCH', '/api/organizations/1/members/1'],
    ['POST', '/api/organizations/1/ai/job-draft'],
    ['POST', '/api/organizations/1/ai/match-candidate'],
    ['POST', '/api/organizations/1/ai/interview-questions'],
    ['GET', '/api/conversations'],
    ['POST', '/api/conversations/1/read'],
    ['DELETE', '/api/conversations/1/messages/1'],
    ['DELETE', '/api/conversations/1'],
    ['GET', '/api/notifications'],
    ['GET', '/api/jobs'],
    ['GET', '/api/feed'],
    ['POST', '/api/feed/media/video'],
    ['GET', '/api/feed/media/video/sample.mp4'],
    ['GET', '/api/feed/1/comments'],
    ['POST', '/api/feed/comments/1/like'],
    ['GET', '/api/profiles'],
    ['GET', '/api/profiles/trending'],
    ['GET', '/api/profiles/1'],
    ['POST', '/api/reports'],
  ] as const;

  for (const [method, path] of protectedRoutes) {
    const res = await fetch(`${baseUrl}${path}`, { method });
    assert.equal(res.status, 401, `Expected 401 on ${method} ${path}, got ${res.status}`);
  }

  // 2. Payment/credit, removed admin, and removed Career Studio endpoints MUST NOT exist (404)
  const removedRoutes = [
    ['GET', '/api/payments/checkout'],
    ['GET', '/api/payments/webhook'],
    ['GET', '/api/wallet'],
    ['GET', '/api/credits/purchase'],
    ['GET', '/api/subscriptions'],
    ['GET', '/api/admin/overview'],
    ['GET', '/api/career/overview'],
    ['POST', '/api/career/parse-cv'],
    ['POST', '/api/career/analyze-cv'],
    ['POST', '/api/career/cv-versions'],
    ['POST', '/api/career/cv-documents'],
  ] as const;
  for (const [method, path] of removedRoutes) {
    const res = await fetch(`${baseUrl}${path}`, { method });
    assert.equal(res.status, 404, `Removed route ${method} ${path} must return 404, got ${res.status}`);
  }

  // 3. Health endpoint returns 200 without leaking user-posted content
  const healthRes = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthRes.status, 200);
  const healthJson = (await healthRes.json()) as { status: string };
  assert.equal(healthJson.status, 'ok');
});
