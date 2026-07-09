import { test, expect } from '@playwright/test';

/** Must match Session.name in seed_playwright_e2e management command. */
const SESSION_NAME = 'PlaywrightE2ESession';

const password = process.env.E2E_SESSION_PASSWORD ?? 'playwright-e2e';

test.describe('Django auth dialog', () => {
  test('password dialog happy path', { tag: ['@django'] }, async ({ page }) => {
    await page.goto('/home');
    await expect(page.getByTestId('auth-student-id')).toBeVisible();
    await page.getByTestId('auth-student-id').fill('0');
    await page.getByTestId('auth-session-password').fill(password);
    await page.getByTestId('auth-dialog-proceed').click();
    await expect(page).toHaveTitle(new RegExp(SESSION_NAME));
    await expect.poll(async () =>
      page.evaluate(() => sessionStorage.getItem('passwordDialogDismissed'))
    ).toBe('true');
  });
});
