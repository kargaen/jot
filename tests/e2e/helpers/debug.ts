import { test, type Page } from "@playwright/test";

const stepDelayMs = Number(process.env.PW_STEP_DELAY_MS ?? "0");

export async function debugStep(
  page: Page,
  label: string,
  action: () => Promise<void>,
) {
  await test.step(label, async () => {
    await action();
    if (stepDelayMs > 0) {
      await page.waitForTimeout(stepDelayMs);
    }
  });
}
