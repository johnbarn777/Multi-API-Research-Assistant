import { expect, test } from "@playwright/test";

test.describe("Research flow", () => {
  test("redirects unauthenticated users to the sign-in page", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/sign-in\?redirectedFrom=%2Fdashboard$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test.skip("user can create and complete a research session", async () => {
    // TODO: Implement Playwright flow once UI + backend ready.
  });
});
