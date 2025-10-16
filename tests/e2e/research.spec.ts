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

  test("user completes multi-question refinement and reaches ready-to-run state", async ({ page }) => {
    test.skip(!DEV_BYPASS_ENABLED, "Dev auth bypass must be enabled for this scenario.");

    const researchId = "research-e2e-456";
    const timestamp = new Date("2024-01-02T00:00:00.000Z").toISOString();
    const secondQuestion = "What specific audience should this research prioritize?";
    const finalPrompt = "Investigate climate tech adoption barriers for mid-market manufacturers.";

    let currentResearch = {
      id: researchId,
      ownerUid: "e2e-user",
      title: "Climate strategy enablement",
      status: "refining",
      dr: {
        sessionId: "session-e2e-xyz",
        questions: [{ index: 1, text: "What is the core outcome you expect?" }],
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
          body: JSON.stringify({ item: currentResearch })
        });
        return;
      }

      await route.continue();
    });

    await page.route("**/api/research", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: [currentResearch],
            nextCursor: null
          })
        });
        return;
      }

      await route.continue();
    });

    let answerCalls = 0;
    await page.route(`**/api/research/${researchId}/openai/answer`, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }

      const payload = route.request().postDataJSON() as { answer: string };
      answerCalls += 1;

      if (answerCalls === 1) {
        currentResearch = {
          ...currentResearch,
          dr: {
            ...currentResearch.dr,
            answers: [{ index: 1, answer: payload.answer }],
            questions: [
              ...currentResearch.dr.questions,
              { index: 2, text: secondQuestion }
            ]
          },
          updatedAt: timestamp
        };

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            item: currentResearch,
            nextQuestion: { index: 2, text: secondQuestion },
            finalPrompt: null
          })
        });
        return;
      }

      currentResearch = {
        ...currentResearch,
        status: "ready_to_run",
        dr: {
          ...currentResearch.dr,
          answers: [
            ...currentResearch.dr.answers.filter((answer) => answer.index !== 2),
            { index: 2, answer: payload.answer }
          ],
          finalPrompt
        },
        updatedAt: timestamp
      };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          item: currentResearch,
          nextQuestion: null,
          finalPrompt
        })
      });
    });

    await page.goto(`/research/${researchId}`);

    const textarea = page.getByRole("textbox");
    await expect(textarea).toBeEnabled();

    const submit = page.getByRole("button", { name: "Submit answer" });
    await expect(submit).toBeDisabled();

    await textarea.fill("Define strategic KPIs for transformation.");
    await expect(submit).not.toBeDisabled();
    await submit.click();

    await expect(page.getByText("Question 2 of 2")).toBeVisible();
    await expect(page.getByText(secondQuestion)).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();
    await expect(textarea).toHaveValue("Define strategic KPIs for transformation.");
    await page.getByRole("button", { name: "Next" }).click();

    await textarea.fill("Focus on mid-market manufacturers.");
    await submit.click();

    await expect(page.getByText("Refined prompt ready")).toBeVisible();
    await expect(page.getByText("Ready to run")).toBeVisible();
    await expect(page.locator("pre").first()).toContainText(finalPrompt);
  });
});
