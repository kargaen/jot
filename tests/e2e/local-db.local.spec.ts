import { expect, test } from "@playwright/test";
import { debugStep } from "./helpers/debug";

test.describe("local db harness", () => {
  test("loads curated local fixtures and persists a new task", async ({
    page,
  }) => {
    const newTitle = `Playwright local task ${Date.now()}`;

    // Later local-db coverage ideas:
    // - create a project-scoped task through the real CreateTask metadata UI
    // - verify seeded tags and tag attachment
    // - drive the real dashboard once the Tauri/browser boundary is thinned out
    // - add cleanup and mutation checks for complete / delete / reorder flows
    await page.goto("/local-db-harness.html");

    await expect(page.getByTestId("local-db-harness")).toBeVisible();
    await expect(page.getByTestId("local-db-status")).toContainText(
      "Connected to the local seeded test database.",
    );
    await expect(page.getByTestId("metric-areas")).toContainText("2");
    await expect(page.getByTestId("metric-projects")).toContainText("2");
    await expect(page.getByTestId("local-db-task-list")).toContainText(
      "Seeded inbox task",
    );
    await expect(page.getByTestId("local-db-task-list")).toContainText(
      "Seeded project task",
    );

    await debugStep(page, "fill the real local task input", async () => {
      await page.getByPlaceholder("Create a local test task...").fill(newTitle);
    });

    await debugStep(page, "submit the task to the local database", async () => {
      await page.getByPlaceholder("Create a local test task...").press("Enter");
    });

    await debugStep(page, "refresh from the database", async () => {
      await page.getByTestId("local-db-refresh").click();
    });

    await expect(page.getByTestId("local-db-task-list")).toContainText(newTitle);
  });
});
