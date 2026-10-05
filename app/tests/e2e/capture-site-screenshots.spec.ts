import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Not a test: regenerates the screenshots used by ../site. Runs only with CAPTURE_SITE=1, e.g.
//   CAPTURE_SITE=1 npx playwright test capture-site-screenshots
// It drives the guided demo (synthetic data, fake LLM), so the images show demo content.
test.skip(!process.env.CAPTURE_SITE, "set CAPTURE_SITE=1 to regenerate the site screenshots");

const OUT = path.resolve(__dirname, "../../../site/assets/img");

test("capture site screenshots", async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const page: Page = await (await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 })).newPage();
  const shot = (name: string, target: Page | ReturnType<Page["locator"]> = page, fullPage = false) =>
    "screenshot" in target && "goto" in target
      ? (target as Page).screenshot({ path: path.join(OUT, `${name}.png`), fullPage })
      : (target as ReturnType<Page["locator"]>).screenshot({ path: path.join(OUT, `${name}.png`) });

  await page.goto("/login");
  await page.getByPlaceholder("Email").fill("admin@example.com");
  await page.getByPlaceholder("Password").fill("changeme-dev");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/cases$/);

  await page.goto("/demo");
  await page.getByRole("button", { name: "Load demo data" }).click();
  await expect(page.getByRole("link", { name: "4. Evidence checker" })).toBeVisible({ timeout: 45_000 });
  const href = async (label: string) => (await page.getByRole("link", { name: label }).getAttribute("href"))!.split("?")[0];
  const vasePath = await href("4. Evidence checker");

  await page.goto(vasePath);
  await shot("case-overview");
  const section = (heading: string) => page.locator("section").filter({ has: page.getByRole("heading", { name: heading, exact: true }) }).last();
  await shot("evidence-missing", section("Carrier claim evidence checklist"));
  await shot("evidence-request", section("Customer evidence request"));

  // Customer sends the outer-box photo (demo shortcut), then the gate clears.
  await page.goto(`${vasePath}?demo=6#proposals`);
  await page.getByRole("button", { name: "Demo shortcut: customer sends the outer-box photo" }).click();
  await expect(page.getByText("[x] Outer carton photo")).toBeVisible({ timeout: 20_000 });
  await page.goto(vasePath);
  await shot("score-after", section("Workflow score"));
  await page.getByText(/Policy excerpts \(\d+\)/).first().click();
  await shot("proposals", page.locator("#proposals"));
  await shot("recovery", page.locator("#recovery"));

  await page.goto("/approvals");
  await shot("approvals");

  await page.goto(vasePath);
  await shot("audit", page.locator("#audit"));
});
