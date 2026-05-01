import { expect, test } from "@playwright/test";
import { debugStep } from "./helpers/debug";

test.describe("desktop auth harness", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth-harness.html");
  });

  test("lets me visually inspect the sign-in and sign-up flow", async ({
    page,
  }) => {
    // Later coverage ideas:
    // - successful desktop sign-in with a mocked authenticated shell
    // - awaiting-confirmation resend failure state
    // - confirmed-user onboarding into the first space
    // - create-task full form from the real dashboard shell
    await expect(page.getByTestId("auth-screen")).toBeVisible();
    await expect(page.getByTestId("auth-title")).toHaveText("Jot");
    await expect(page.getByTestId("auth-email")).toBeVisible();
    await expect(page.getByTestId("auth-password")).toBeVisible();
    await expect(page.getByTestId("auth-remember")).toBeVisible();
    await expect(page.getByTestId("auth-submit")).toHaveText("Sign in");

    await debugStep(page, "switch to sign-up mode", async () => {
      await page.getByTestId("auth-mode-toggle").click();
    });
    await expect(page.getByTestId("auth-submit")).toHaveText("Create account");
    await expect(page.getByTestId("auth-remember")).toHaveCount(0);

    await debugStep(page, "fill the sign-up form", async () => {
      await page.getByTestId("auth-email").fill("visual-check@example.com");
      await page.getByTestId("auth-password").fill("secret-pass");
    });

    await debugStep(page, "submit the sign-up form", async () => {
      await page.getByTestId("auth-submit").click();
    });

    await expect(page.getByTestId("auth-awaiting-confirmation")).toBeVisible();
    await expect(page.getByTestId("auth-awaiting-email")).toHaveText(
      "visual-check@example.com",
    );
    await expect(page.getByTestId("auth-notice")).toContainText(
      "Check your email to finish creating your account.",
    );
    await expect(page.getByTestId("auth-resend")).toContainText("Resend in");

    await page.waitForTimeout(1_100);
    await debugStep(page, "resend the confirmation mail", async () => {
      await page.getByTestId("auth-resend").click();
    });
    await expect(page.getByTestId("auth-notice")).toContainText(
      "Confirmation email sent.",
    );

    await debugStep(page, "return to the editable form", async () => {
      await page.getByTestId("auth-mode-toggle").click();
    });
    await expect(page.getByTestId("auth-submit")).toHaveText("Create account");
    await expect(page.getByTestId("auth-email")).toHaveValue(
      "visual-check@example.com",
    );
  });

  test("shows the mocked sign-in error state", async ({ page }) => {
    await debugStep(page, "fill the sign-in form", async () => {
      await page.getByTestId("auth-email").fill("wrong@example.com");
      await page.getByTestId("auth-password").fill("bad-password");
      await page.getByTestId("auth-remember-checkbox").uncheck();
    });

    await debugStep(page, "submit the sign-in form", async () => {
      await page.getByTestId("auth-submit").click();
    });

    await expect(page.getByTestId("auth-error")).toContainText(
      "Mock sign-in failed",
    );
    await expect(page.getByTestId("auth-submit")).toHaveText("Sign in");
  });
});
