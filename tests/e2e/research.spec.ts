import { expect, test } from "@playwright/test";

const DEV_BYPASS_ENABLED =
  process.env.DEV_AUTH_BYPASS === "true" || process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true";

test.describe("Research flow", () => {
  test("redirects unauthenticated users to the sign-in page", async ({ page }) => {
    test.skip(DEV_BYPASS_ENABLED, "Dev auth bypass enabled for e2e environment.");

    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/sign-in\?redirectedFrom=%2Fdashboard$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("user can start a research session and see the first refinement question", async ({ page }) => {
    test.skip(!DEV_BYPASS_ENABLED, "Dev auth bypass must be enabled for this scenario.");

    const researchId = "research-e2e-123";
    const timestamp = new Date("2024-01-01T00:00:00.000Z").toISOString();
    const refinementQuestion = "What is the primary outcome you want this research to achieve?";

    const researchPayload = {
      id: researchId,
      ownerUid: "e2e-user",
      title: "AI readiness in healthcare",
      status: "refining",
      dr: {
        sessionId: "session-e2e-abc",
        questions: [{ index: 1, text: refinementQuestion }],
        answers: []
      },
      gemini: {
        questions: [],
        answers: []
      },
      report: {},
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await page.route(`**/api/research/${researchId}`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ item: researchPayload })
        });
        return;
      }

      await route.continue();
    });

    await page.route("**/api/research", async (route) => {
      const method = route.request().method();

      if (method === "POST") {
        const body = route.request().postDataJSON() as { title: string };
        expect(body.title).toBe("AI readiness in healthcare");

        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ item: researchPayload })
        });
        return;
      }

      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: [researchPayload],
            nextCursor: null
          })
        });
        return;
      }

      await route.continue();
    });

    await page.goto("/research/new");

    await page.getByLabel("Research topic").fill("AI readiness in healthcare");
    await page.getByRole("button", { name: "Start Refinement" }).click();

    await page.waitForURL(`/research/${researchId}`);

    await expect(page.getByText("Question 1 of 1")).toBeVisible();
    await expect(page.getByText(refinementQuestion)).toBeVisible();
    await expect(page.getByRole("textbox")).toBeEnabled();
  });
});
