import { test, expect } from '@playwright/test';

/** Must match Session.password seeded by seed_playwright_e2e (JPSI_SESSION_NAME/JPSI_EVENT_NAME). */
const password = process.env.E2E_JPSI_SESSION_PASSWORD ?? 'playwright-e2e-jpsi';

/**
 * Contract aligned with the Django jpsi API tests: no `massWindow` in the payload (the student
 * app locks the signal window to a fixed width - see `ci/docs/jpsi-analysis-teacher.md`,
 * "Mass-window safety net") and `nEvents` is only present for pp/p-Pb, never for Pb-Pb
 * centralities (fixed constant kept on the teacher side).
 */
test.describe('Django jpsi analysis API', () => {
  test('PUT jpsi_analysis succeeds with session password', { tag: ['@django'] }, async ({ request }) => {
    const res = await request.put('http://127.0.0.1:8000/api/v1/jpsi_analysis/0/', {
      data: {
        password,
        results: [
          { system: 'pp', signal: 59, signalError: 8, nEvents: 1000 },
          { system: 'pbPb_0_5', signal: 34662, signalError: 186 },
        ],
      },
      headers: { 'Content-Type': 'application/json' },
    });
    const body = await res.text();
    expect(res.ok(), `HTTP ${res.status()}: ${body}`).toBeTruthy();
  });

  test('PUT jpsi_analysis rejects a Pb-Pb entry carrying nEvents', { tag: ['@django'] }, async ({ request }) => {
    const res = await request.put('http://127.0.0.1:8000/api/v1/jpsi_analysis/0/', {
      data: {
        password,
        results: [{ system: 'pbPb_0_5', signal: 34662, signalError: 186, nEvents: 40090000 }],
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(400);
  });

  test('PUT jpsi_analysis is rejected against a strangeness session', { tag: ['@django'] }, async ({ request }) => {
    const strangenessPassword = process.env.E2E_SESSION_PASSWORD ?? 'playwright-e2e';
    const res = await request.put('http://127.0.0.1:8000/api/v1/jpsi_analysis/0/', {
      data: {
        password: strangenessPassword,
        results: [{ system: 'pp', signal: 59, signalError: 8, nEvents: 1000 }],
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(403);
  });
});
