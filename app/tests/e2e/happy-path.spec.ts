import { expect, test, type Browser, type Page } from "@playwright/test";
import { Client } from "pg";

// The full happy path, mirroring Testing/e2e_damaged_shipment_test_results.md:
// case -> proposal -> evidence gate -> evidence uploaded -> new proposal -> both approvals
// -> resolution proposal sent -> recovery draft sent. Runs with the fake LLM.

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==", "base64");
const PASSWORD = "changeme-dev";

async function login(browser: Browser, who: "agent" | "reviewer"): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill(`${who}@example.com`);
  await page.getByPlaceholder("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/cases$/);
  return page;
}

async function upload(page: Page, name: string, category: string) {
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "image/png", buffer: PNG });
  await page.locator('form[action="/api/attachments/upload"] select[name="category"]').selectOption(category);
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText(name).first()).toBeVisible();
}

// Fixtures via plain SQL: Playwright loads specs as CommonJS and cannot import the app's
// generated (ESM) Prisma client.
test.beforeAll(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const { rows } = await c.query(
    `insert into "Order" (id, "orderDate", "salesChannel", "customerName", sku, "productName", quantity, "orderValue", supplier, "updatedAt")
     values (gen_random_uuid(), now(), 'Webshop', 'E2E Customer', 'E2E-1', 'E2E Vase', 1, 40, 'E2E Supplier', now()) returning id`,
  );
  await c.query(
    `insert into "Shipment" (id, "linkedOrderId", carrier, "trackingNumber", "shipDate", "updatedAt")
     values (gen_random_uuid(), $1, 'DPD', 'E2E-TRACK-1', now(), now())`,
    [rows[0].id],
  );
  await c.end();
});

test("damaged delivery: from complaint to sent recovery claim", async ({ browser }) => {
  const agent = await login(browser, "agent");

  // 1. Create the case. The fake LLM classifies it as damaged_delivery; no evidence exists yet.
  await agent.goto("/cases/new");
  await agent.locator('select[name="source"]').selectOption("email");
  await agent.locator('input[name="customerName"]').fill("E2E Customer");
  await agent.locator('select[name="linkedOrderId"]').selectOption({ label: "E2E Customer - E2E Vase" });
  await agent.locator('select[name="linkedShipmentId"]').selectOption({ label: "DPD E2E-TRACK-1" });
  await agent.locator('input[name="recoveryNeeded"]').check();
  await agent.locator('textarea[name="complaintText"]').fill("The vase arrived shattered.");
  await agent.getByRole("button", { name: "Create case" }).click();
  await expect(agent).toHaveURL(/\/cases\/[0-9a-f-]{36}$/);
  const caseUrl = agent.url();

  // 2. Evidence gate fired: recommendation forced, checklist empty, first proposal is current.
  await expect(agent.getByText("Request Missing Evidence").first()).toBeVisible();
  await expect(agent.getByText("evidence gate applied")).toBeVisible();
  await expect(agent.getByText("[ ] Shipping label photo")).toBeVisible();
  await expect(agent.getByText("Current", { exact: true })).toBeVisible();
  await expect(agent.getByText("awaiting_approval").first()).toBeVisible();

  // 3. Upload the three evidence files; the checklist flips immediately.
  await upload(agent, "test_e2e_damaged_vase_broken.png", "photo_evidence");
  await upload(agent, "test_e2e_outer_carton_box.png", "photo_evidence");
  await expect(agent.getByText("[ ] Shipping label photo")).toBeVisible(); // still missing
  await upload(agent, "test_e2e_shipping_label.png", "shipping_label");
  await expect(agent.getByText("[x] Shipping label photo")).toBeVisible();
  await expect(agent.getByText("[x] Damaged item photo")).toBeVisible();
  await expect(agent.getByText("[x] Outer carton photo")).toBeVisible();

  // 4. Generate a new proposal: gate no longer applies, the old one is superseded.
  await agent.getByRole("button", { name: "Generate proposal" }).click();
  await expect(agent.getByText("Arrange Replacement Shipment").first()).toBeVisible();
  await expect(agent.getByText("Superseded", { exact: true })).toBeVisible();
  await expect(agent.getByText("Superseded: no decision was recorded before it was replaced")).toBeVisible();

  // 5. Agents cannot review. A reviewer sees exactly the two live approvals (superseded one excluded).
  await agent.goto("/approvals");
  await expect(agent.getByRole("button", { name: "Approve" })).toHaveCount(0);
  const reviewer = await login(browser, "reviewer");
  await reviewer.goto("/approvals");
  await expect(reviewer.getByRole("button", { name: "Approve" })).toHaveCount(2);
  await expect(reviewer.getByText("Request Missing Evidence")).toHaveCount(0);
  for (let left = 2; left > 0; left--) {
    await reviewer.getByRole("button", { name: "Approve" }).first().click();
    await expect(reviewer.getByRole("button", { name: "Approve" })).toHaveCount(left - 1);
  }

  // 6. Mark both as sent (manual attestation).
  await agent.goto(caseUrl);
  const sendButtons = agent.getByRole("button", { name: /Mark as sent/ });
  await expect(sendButtons).toHaveCount(2);
  await sendButtons.first().click();
  await expect(sendButtons).toHaveCount(1);
  await sendButtons.first().click();
  await expect(sendButtons).toHaveCount(0);
  await expect(agent.getByText("(sent)")).toHaveCount(2);

  // 7. Audit trail shows the whole chain.
  for (const action of ["case_created", "resolution_proposal_generated", "evidence_judged", "resolution_proposal_superseded", "resolution_proposal_approved", "recovery_draft_approved", "resolution_proposal_sent", "recovery_draft_sent"]) {
    await expect(agent.getByText(action).first()).toBeVisible();
  }
});
