import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { buildResearchPdf } from "../../src/lib/pdf/builder";
import type { ListResearchResponse, ResearchListItem } from "../../src/types/api";
import type { ResearchStatus } from "../../src/types/research";
import { SAMPLE_PDF_PAYLOAD } from "../../src/tests/fixtures/researchReport";

function parseBoolean(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

const DEV_BYPASS_ENABLED = (() => {
  const explicit =
    parseBoolean(process.env.DEV_AUTH_BYPASS) ||
    parseBoolean(process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS);

  if (
    process.env.DEV_AUTH_BYPASS === undefined &&
    process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === undefined
  ) {
    return true;
  }

  return explicit;
})();


test.describe("Research flow", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    await context.clearPermissions();
    await context.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  });

  test("redirects unauthenticated users to the sign-in page", async ({ page }) => {
    await page.goto("/dashboard");

    const currentUrl = page.url();
    test.skip(
      DEV_BYPASS_ENABLED || currentUrl.endsWith("/dashboard"),
      "Dev auth bypass active for e2e environment."
    );

    await expect(page).toHaveURL(/\/sign-in\?redirectedFrom=%2Fdashboard$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("redirects authenticated users away from the sign-in page", async ({ page }) => {
    test.skip(!DEV_BYPASS_ENABLED, "Dev auth bypass must be enabled for this scenario.");

    await page.goto("/sign-in?redirectedFrom=%2F");
    await page.waitForURL("**/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("dashboard displays research history with correct ordering", async ({ page }) => {
    test.skip(!DEV_BYPASS_ENABLED, "Dev auth bypass must be enabled for this scenario.");

    await seedDashboardFixture(page);
    await page.goto("/dashboard");

    const cards = page.locator("article");
    await expect(cards).toHaveCount(DEFAULT_DASHBOARD_FIXTURE.items.length);

    await expect(cards.nth(0)).toContainText("Completed session");
    await expect(cards.nth(0)).toContainText("Completed");

    await expect(cards.nth(1)).toContainText("Running session");
    await expect(cards.nth(1)).toContainText("Running");

    await expect(cards.nth(2)).toContainText("Awaiting refinements");
    await expect(cards.nth(2)).toContainText("Awaiting Refinements");

    await expect(page.getByRole("link", { name: "Load older sessions" })).toHaveCount(0);
  });
  test("dashboard passes automated accessibility checks", async ({ page }) => {
    test.skip(!DEV_BYPASS_ENABLED, "Dev auth bypass must be enabled for this scenario.");

    await seedDashboardFixture(page);
    await page.goto("/dashboard");

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(
      accessibilityScanResults.violations,
      JSON.stringify(accessibilityScanResults.violations, null, 2)
    ).toEqual([]);
  });
  test.describe("mobile layout", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("dashboard avoids horizontal scrolling on mobile", async ({ page }) => {
      test.skip(!DEV_BYPASS_ENABLED, "Dev auth bypass must be enabled for this scenario.");

      await seedDashboardFixture(page);
      await page.goto("/dashboard");

      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(hasOverflow).toBe(false);
    });
  });
  test("user can start a research session and see the first refinement question", async ({ page }) => {
    test.skip(!DEV_BYPASS_ENABLED, "Dev auth bypass must be enabled for this scenario.");

    const researchId = "research-e2e-123";
    const timestamp = new Date("2024-01-01T00:00:00.000Z").toISOString();
    const refinementQuestion = "What is the primary outcome you want this research to achieve?";

    const researchPayload: ResearchListItem = {
      id: researchId,
      ownerUid: "e2e-user",
      title: "AI readiness in healthcare",
      status: "refining" as ResearchStatus,
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

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(
      accessibilityScanResults.violations,
      JSON.stringify(accessibilityScanResults.violations, null, 2)
    ).toEqual([]);
  });

  test("user completes multi-question refinement and reaches ready-to-run state", async ({ page }) => {
    test.skip(!DEV_BYPASS_ENABLED, "Dev auth bypass must be enabled for this scenario.");

    const researchId = "research-e2e-456";
    const timestamp = new Date("2024-01-02T00:00:00.000Z").toISOString();
    const secondQuestion = "What specific audience should this research prioritize?";
    const finalPrompt = "Investigate climate tech adoption barriers for mid-market manufacturers.";

    let currentResearch: ResearchListItem = {
      id: researchId,
      ownerUid: "e2e-user",
      title: "Climate strategy enablement",
      status: "refining" as ResearchStatus,
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
              ...(currentResearch.dr.questions ?? []),
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
        status: "ready_to_run" as ResearchStatus,
        dr: {
          ...currentResearch.dr,
          answers: [
            ...(currentResearch.dr.answers ?? []).filter((answer) => answer.index !== 2),
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

  test("user runs providers and observes progress updates", async ({ page }) => {
    test.skip(!DEV_BYPASS_ENABLED, "Dev auth bypass must be enabled for this scenario.");

    const researchId = "research-e2e-run";
    const timestamp = new Date("2024-01-03T00:00:00.000Z").toISOString();
    const finalPrompt = "Assess AI adoption patterns in sustainable supply chains.";

    let currentResearch: ResearchListItem = {
      id: researchId,
      ownerUid: "e2e-user",
      title: "AI adoption tracking",
      status: "ready_to_run" as ResearchStatus,
      dr: {
        sessionId: "session-run-123",
        questions: [],
        answers: [],
        finalPrompt,
        status: "idle"
      },
      gemini: {
        questions: [],
        answers: [],
        status: "idle"
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

    await page.route(`**/api/research/${researchId}/run`, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }

      const runningState: ResearchListItem = {
        ...currentResearch,
        status: "running" as ResearchStatus,
        dr: {
          ...currentResearch.dr,
          status: "running",
          startedAt: timestamp,
          completedAt: undefined,
          durationMs: 0,
          error: null,
          result: undefined
        },
        gemini: {
          ...currentResearch.gemini,
          status: "running",
          startedAt: timestamp,
          completedAt: undefined,
          durationMs: 0,
          error: null,
          result: undefined
        },
        updatedAt: timestamp
      };

      currentResearch = runningState;

      setTimeout(() => {
        currentResearch = {
          ...runningState,
          status: "completed" as ResearchStatus,
          dr: {
            ...runningState.dr,
            status: "success",
            completedAt: new Date("2024-01-03T00:05:00.000Z").toISOString(),
            durationMs: 3000,
            result: {
              raw: {},
              summary: "OpenAI summary",
              insights: ["Key insight A"],
              meta: { model: "openai-dr", tokens: 321 }
            },
            error: null
          },
          gemini: {
            ...runningState.gemini,
            status: "success",
            completedAt: new Date("2024-01-03T00:05:05.000Z").toISOString(),
            durationMs: 3500,
            result: {
              raw: {},
              summary: "Gemini summary",
              insights: ["Key insight B"],
              meta: { model: "gemini-pro", tokens: 256 }
            },
            error: null
          },
          updatedAt: new Date("2024-01-03T00:05:05.000Z").toISOString()
        };
      }, 50);

      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          item: runningState,
          alreadyRunning: false
        })
      });
    });

    await page.goto(`/research/${researchId}`);

    await expect(page.getByText("Refined prompt ready")).toBeVisible();
    const runButton = page.getByRole("button", { name: "Run providers" });
    await expect(runButton).toBeVisible();

    await runButton.click();

    const refinedSection = page.locator("section").filter({ hasText: "Refined prompt ready" });
    await expect(refinedSection).toContainText("Running");

    const openAiCard = page
      .locator("article")
      .filter({ hasText: "OpenAI Deep Research" });
    const geminiCard = page
      .locator("article")
      .filter({ hasText: "Google Gemini" });

    await expect(openAiCard).toContainText("Running");
    await expect(geminiCard).toContainText("Running");

    await page.waitForTimeout(2700);

    await expect(refinedSection).toContainText("Completed");
    await expect(openAiCard).toContainText("Success");
    await expect(geminiCard).toContainText("Success");
    await expect(runButton).toBeHidden();
  });

  test("finalize API returns a PDF payload", async ({ page }) => {
    test.skip(!DEV_BYPASS_ENABLED, "Dev auth bypass must be enabled for this scenario.");

    const researchId = "research-e2e-pdf";
    const pdfBytes = await buildResearchPdf(SAMPLE_PDF_PAYLOAD);
    const pdfBuffer = Buffer.from(pdfBytes);

    await page.route(`**/api/research/${researchId}/finalize`, async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": pdfBuffer.length.toString(),
          "X-Report-Pdf-Path": "buffer://e2e/research.pdf"
        },
        body: pdfBuffer
      });
    });

    const response = await page.request.post(`/api/research/${researchId}/finalize`);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toContain("application/pdf");
    expect(response.headers()["x-report-pdf-path"]).toBe("buffer://e2e/research.pdf");

    const body = await response.body();
    expect(body.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  test("shows email delivery success banner on research detail page", async ({ page }) => {
    test.skip(!DEV_BYPASS_ENABLED, "Dev auth bypass must be enabled for this scenario.");

    const researchId = "research-e2e-email-success";
    const timestamp = new Date("2024-01-03T00:00:00.000Z").toISOString();

    const researchPayload: ResearchListItem = {
      id: researchId,
      ownerUid: "e2e-user",
      title: "Email Delivery Success",
      status: "completed" as ResearchStatus,
      dr: {
        status: "success"
      },
      gemini: {
        status: "success"
      },
      report: {
        emailStatus: "sent",
        emailedTo: "user@example.com",
        emailError: null
      },
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

    await page.goto(`/research/${researchId}`);

    await expect(page.getByText("Email sent")).toBeVisible();
    await expect(page.getByText(/Report emailed to user@example\.com/i)).toBeVisible();
  });

  test("shows email failure banner on research detail page", async ({ page }) => {
    test.skip(!DEV_BYPASS_ENABLED, "Dev auth bypass must be enabled for this scenario.");

    const researchId = "research-e2e-email-failure";
    const timestamp = new Date("2024-01-04T00:00:00.000Z").toISOString();

    const researchPayload: ResearchListItem = {
      id: researchId,
      ownerUid: "e2e-user",
      title: "Email Delivery Failure",
      status: "completed" as ResearchStatus,
      dr: {
        status: "success"
      },
      gemini: {
        status: "success"
      },
      report: {
        emailStatus: "failed",
        emailedTo: "user@example.com",
        emailError: "SendGrid unavailable"
      },
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

    await page.goto(`/research/${researchId}`);

    await expect(page.getByText("Email failed")).toBeVisible();
    await expect(
      page.getByText(/We couldn't deliver the email automatically/i)
    ).toBeVisible();
    await expect(page.getByText(/Reason: SendGrid unavailable/i)).toBeVisible();
  });
});

const DEFAULT_DASHBOARD_FIXTURE: ListResearchResponse = {
  items: [
    {
      id: "research-done",
      ownerUid: "e2e-user",
      title: "Completed session",
      status: "completed" as ResearchStatus,
      dr: { status: "success" },
      gemini: { status: "success" },
      report: {},
      createdAt: "2024-01-03T10:00:00.000Z",
      updatedAt: "2024-01-03T10:30:00.000Z"
    },
    {
      id: "research-running",
      ownerUid: "e2e-user",
      title: "Running session",
      status: "running" as ResearchStatus,
      dr: { status: "running" },
      gemini: { status: "queued" },
      report: {},
      createdAt: "2024-01-02T09:00:00.000Z",
      updatedAt: "2024-01-02T09:15:00.000Z"
    },
    {
      id: "research-awaiting",
      ownerUid: "e2e-user",
      title: "Awaiting refinements",
      status: "awaiting_refinements" as ResearchStatus,
      dr: { status: "idle" },
      gemini: { status: "idle" },
      report: {},
      createdAt: "2024-01-01T08:00:00.000Z",
      updatedAt: "2024-01-01T08:05:00.000Z"
    }
  ],
  nextCursor: null
};

async function seedDashboardFixture(page: import("@playwright/test").Page) {
  const encodedFixture = Buffer.from(JSON.stringify(DEFAULT_DASHBOARD_FIXTURE), "utf8").toString(
    "base64"
  );

  await page.context().addCookies([
    {
      name: "__dashboard_fixture",
      value: encodedFixture,
      url: "http://localhost:3000",
      path: "/"
    }
  ]);
}
