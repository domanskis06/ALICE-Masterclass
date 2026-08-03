import { test, expect } from '@playwright/test';

const password = process.env.E2E_SESSION_PASSWORD ?? 'playwright-e2e';

test.describe('Django strangeness exercise', () => {
  test('visual analysis page loads with dataset selector', { tag: ['@django'] }, async ({ page }) => {
    await page.addInitScript(
      ([pwd, dismissKey]: [string, string]) => {
        sessionStorage.setItem('password', pwd);
        sessionStorage.setItem('studentID', '0');
        sessionStorage.setItem(dismissKey, 'true');
      },
      [password, 'passwordDialogDismissed'],
    );

    await page.goto('/strangeness-visual-analysis');
    await expect(page.getByTestId('strangeness-visual-analysis-page')).toBeVisible();

    // Fresh sessions: collision intro → detector assembly → dataset UI.
    // Do not use locator.or() here: assembly skip and dataset select stay mounted
    // (often with [hidden]), so .or() matches multiple nodes and fails strict mode.
    const introSkip = page.getByTestId('va-skip-collision-intro');
    const assemblySkip = page.getByTestId('va-skip-detector-assembly');
    const datasetSelect = page.getByTestId('va-dataset-select');

    await expect(introSkip).toBeVisible({ timeout: 15_000 });
    await introSkip.click();

    await expect(assemblySkip).toBeVisible({ timeout: 10_000 });
    await assemblySkip.click();

    await expect(datasetSelect).toBeVisible();
    await expect(page.getByTestId('cern-toolbar')).toBeVisible();
  });
});
