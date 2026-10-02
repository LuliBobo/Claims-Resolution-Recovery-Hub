import { expect, test, type Browser, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { buildTextPdf } from "@/lib/pdf-build";

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

  // Workflow score: no evidence (3), explicit policy (0), medium priority (1), order 40 (0), recovery w/o evidence (2) = 6
  await expect(agent.getByText("6/15")).toBeVisible();
  await expect(agent.getByText("Request evidence or supervisor check").first()).toBeVisible();

  // 3. Upload the three evidence files; the checklist flips immediately.
  await upload(agent, "test_e2e_damaged_vase_broken.png", "photo_evidence");
  await upload(agent, "test_e2e_outer_carton_box.png", "photo_evidence");
  await expect(agent.getByText("[ ] Shipping label photo")).toBeVisible(); // still missing
  await upload(agent, "test_e2e_shipping_label.png", "shipping_label");
  await expect(agent.getByText("[x] Shipping label photo")).toBeVisible();
  await expect(agent.getByText("[x] Damaged item photo")).toBeVisible();
  await expect(agent.getByText("[x] Outer carton photo")).toBeVisible();

  // The score follows the evidence with no regenerate: evidence now complete (0), recovery strong (3) = 4
  await agent.reload();
  await expect(agent.getByText("4/15")).toBeVisible();
  await expect(agent.getByText("Quick review").first()).toBeVisible();

  // Stored files come back byte for byte, behind login, as the sniffed type, downloading (not rendering).
  const href = await agent.getByRole("link", { name: "test_e2e_shipping_label.png" }).getAttribute("href");
  const file = await agent.request.get(href!);
  expect(file.status()).toBe(200);
  expect(Buffer.compare(await file.body(), PNG)).toBe(0);
  expect(file.headers()["content-type"]).toBe("image/png");
  expect(file.headers()["content-disposition"]).toContain("attachment");
  expect(file.headers()["x-content-type-options"]).toBe("nosniff");
  expect((await agent.request.get(`${href}?inline=1`)).headers()["content-disposition"]).toContain("inline");
  const anonymous = await (await browser.newContext()).request.get(href!);
  expect(anonymous.status()).toBe(401);

  // 4. Generate a new proposal: gate no longer applies, the old one is superseded.
  await agent.getByRole("button", { name: "Generate proposal" }).click();
  await expect(agent.getByText("Arrange Replacement Shipment").first()).toBeVisible();
  await expect(agent.getByText("Superseded", { exact: true })).toBeVisible();
  await expect(agent.getByText("Superseded: no decision was recorded before it was replaced")).toBeVisible();

  // 5. Agents cannot review. A reviewer sees exactly the two live approvals (superseded one excluded).
  await agent.goto("/approvals");
  await expect(agent.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  const reviewer = await login(browser, "reviewer");
  await reviewer.goto("/approvals");
  await expect(reviewer.getByRole("button", { name: "Approve", exact: true })).toHaveCount(2);
  await expect(reviewer.getByText("Request Missing Evidence")).toHaveCount(0);

  // The reviewer corrects the claim text while approving the recovery draft ("Approve with edits")...
  const draftCard = reviewer.locator("div.rounded-md.border").filter({ hasText: "Transit damage" }).first();
  await draftCard.getByText("Edit before approving").click();
  await draftCard.locator('textarea[name="edit_draftText"]').fill("E2E claim text, corrected by reviewer.");
  await draftCard.getByRole("button", { name: "Approve with edits" }).click();
  await expect(reviewer.getByRole("button", { name: "Approve", exact: true })).toHaveCount(1);
  // ...and plainly approves the proposal.
  await reviewer.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(reviewer.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);

  // 6. Mark both as sent (manual attestation).
  await agent.goto(caseUrl);
  const sendButtons = agent.getByRole("button", { name: /Mark as sent/ });
  await expect(sendButtons).toHaveCount(2);
  await sendButtons.first().click();
  await expect(sendButtons).toHaveCount(1);
  await sendButtons.first().click();
  await expect(sendButtons).toHaveCount(0);
  await expect(agent.getByText("(sent)")).toHaveCount(2);

  // The edited text is what is stored, and the page says it was approved with edits.
  await expect(agent.getByText("E2E claim text, corrected by reviewer.")).toBeVisible();
  await expect(agent.getByText("approved with edits by reviewer@example.com (edited: draftText)")).toBeVisible();

  // 7. Audit trail shows the whole chain.
  for (const action of ["case_created", "resolution_proposal_generated", "evidence_judged", "resolution_proposal_superseded", "resolution_proposal_approved", "recovery_draft_approved_with_edits", "resolution_proposal_sent", "recovery_draft_sent"]) {
    await expect(agent.getByText(action).first()).toBeVisible();
  }
});

test("reviewer requests more evidence: the item leaves the queue, needs a comment, and cannot be sent", async ({ browser }) => {
  const agent = await login(browser, "agent");
  await agent.goto("/cases/new");
  await agent.locator('select[name="source"]').selectOption("email");
  await agent.locator('input[name="customerName"]').fill("E2E Evidence Request");
  await agent.locator('textarea[name="complaintText"]').fill("The vase arrived shattered.");
  await agent.getByRole("button", { name: "Create case" }).click();
  await expect(agent).toHaveURL(/\/cases\/[0-9a-f-]{36}$/);
  const caseUrl = agent.url();

  const reviewer = await login(browser, "reviewer");
  await reviewer.goto("/approvals");
  const card = reviewer.locator("div.rounded-md.border").filter({ hasText: "E2E Evidence Request" }).first();
  await card.getByRole("button", { name: "Request more evidence" }).click();
  await expect(card.getByText("comment is required")).toBeVisible(); // nothing changes without saying what is needed

  await card.locator('input[name="comment"]').fill("Please add a photo of the outer carton");
  await card.getByRole("button", { name: "Request more evidence" }).click();
  await expect(reviewer.getByText("E2E Evidence Request")).toHaveCount(0);

  await agent.goto(caseUrl);
  await expect(agent.getByText("(evidence_requested)")).toBeVisible();
  await expect(agent.getByText('evidence requested by reviewer@example.com - "Please add a photo of the outer carton"')).toBeVisible();
  await expect(agent.getByRole("button", { name: /Mark as sent/ })).toHaveCount(0);
  await expect(agent.getByText("resolution_proposal_evidence_requested").first()).toBeVisible();

  // The agent turns it into a customer email: what is missing comes from the data (gate list plus the
  // reviewer's note), the AI only words it, the person edits it and attests that they sent it.
  await expect(agent.getByText("Still needed from the customer")).toBeVisible();
  await expect(agent.getByText("Shipping label photo (missing or not clear enough)").first()).toBeVisible();
  await agent.getByRole("button", { name: "Draft request to customer" }).click();
  const body = agent.locator('textarea[name="body"]');
  await expect(body).toHaveValue(/E2E: Dear customer/);
  await body.fill("Edited by the agent: please send a photo of the whole outer box.");
  await agent.getByRole("button", { name: "Mark as sent (manual attestation)" }).click();
  await expect(agent.locator('textarea[name="body"]')).toHaveCount(0); // the open draft is gone
  await expect(agent.getByText(/Sent by agent@example.com on .* UTC \(manual attestation\)/)).toBeVisible();
  await agent.getByText(/Sent by agent@example.com/).click();
  await expect(agent.getByText("Edited by the agent: please send a photo of the whole outer box.")).toBeVisible(); // the edited text, not the AI's
  for (const action of ["evidence_request_drafted", "evidence_request_edited", "evidence_request_sent"]) {
    await expect(agent.getByText(action).first()).toBeVisible();
  }
});

test("deployment safeguards: security headers, health check, and sign-in lockout", async ({ browser, request }) => {
  // Security headers on a normal page.
  const h = (await request.get("/login")).headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["strict-transport-security"]).toContain("max-age=");
  expect(h["x-powered-by"]).toBeUndefined();

  // Health: public output is minimal. This server runs with the fake LLM on, which must be flagged
  // as degraded (a real deployment never sets it), while the database itself is reachable.
  const health = await request.get("/api/health");
  expect(health.status()).toBe(503);
  expect(await health.json()).toEqual({ status: "degraded", database: true });

  // A dedicated user (created with the production user script) so other tests' accounts stay usable.
  execFileSync("npx", ["tsx", "scripts/create-user.ts", "lockout@example.com", "Lockout Test", "agent"], {
    env: { ...process.env, NEW_USER_PASSWORD: "lockout-test-password" },
    stdio: "pipe",
  });
  const page = await (await browser.newContext()).newPage();
  const attempt = async (password: string) => {
    await page.goto("/login");
    await page.getByPlaceholder("Email").fill("lockout@example.com");
    await page.getByPlaceholder("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
  };
  for (let i = 0; i < 5; i++) {
    await attempt("wrong-password");
    await expect(page.getByText("Invalid email or password.")).toBeVisible();
  }
  await attempt("lockout-test-password"); // the right password is now refused too
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);

  // Other accounts are unaffected.
  await login(browser, "agent");
});

test("policy PDFs: upload, search, and a proposal that cites the verbatim excerpt", async ({ browser }) => {
  const reviewer = await login(browser, "reviewer");
  await reviewer.goto("/policy-rules");
  const sop = reviewer.locator("li").filter({ hasText: "DPD Carrier Claims SOP" }).first();

  // A file that is not a PDF is refused, whatever it is called and whatever type the browser claims.
  await sop.locator('input[type="file"]').setInputFiles({ name: "fake.pdf", mimeType: "application/pdf", buffer: PNG });
  await sop.getByRole("button", { name: "Upload PDF" }).click();
  await expect(reviewer.getByText("Only PDF files can be uploaded as policy documents")).toBeVisible();

  // A real PDF is accepted and split into passages by page.
  const pdf = buildTextPdf([
    "Section 1. A transit damage claim must be filed within 7 days of delivery.",
    "Section 2. Every damaged delivery claim needs a shipping label photo, a damaged item photo and an outer carton photo.",
  ]);
  await sop.locator('input[type="file"]').setInputFiles({ name: "sop.pdf", mimeType: "application/pdf", buffer: Buffer.from(pdf) });
  await sop.getByRole("button", { name: "Upload PDF" }).click();
  await expect(reviewer.getByText(/Done: 2 passages from 2 pages/)).toBeVisible();
  await expect(sop.getByText(/sop\.pdf: 2 pages, 2 passages/)).toBeVisible();

  // The stored PDF downloads behind login; the test search finds the right page.
  const href = await sop.getByRole("link", { name: "sop.pdf" }).getAttribute("href");
  const dl = await reviewer.request.get(href!);
  expect(dl.status()).toBe(200);
  expect(Buffer.compare(await dl.body(), Buffer.from(pdf))).toBe(0);
  expect((await (await browser.newContext()).request.get(href!)).status()).toBe(401);
  await reviewer.getByPlaceholder(/Test search/).fill("outer carton photo");
  await reviewer.getByRole("button", { name: "Search", exact: true }).click();
  await expect(reviewer.locator("blockquote").filter({ hasText: "outer carton photo" })).toBeVisible();
  await expect(reviewer.getByText("DPD Carrier Claims SOP v1.0, page 2")).toBeVisible();

  // A new damaged-delivery case: the retrieved passage is cited verbatim on the proposal. (The fake AI
  // also cites an id it was never shown; that one must be dropped, leaving exactly one excerpt.)
  const agent = await login(browser, "agent");
  await agent.goto("/cases/new");
  await agent.locator('select[name="source"]').selectOption("email");
  await agent.locator('input[name="customerName"]').fill("E2E Policy Cite");
  await agent.locator('textarea[name="complaintText"]').fill("The vase arrived shattered.");
  await agent.getByRole("button", { name: "Create case" }).click();
  await expect(agent).toHaveURL(/\/cases\/[0-9a-f-]{36}$/);
  await agent.getByText("Policy excerpts (1)").first().click();
  await expect(agent.locator("blockquote").filter({ hasText: "Every damaged delivery claim needs a shipping label photo" })).toBeVisible();
  await expect(agent.getByText("DPD Carrier Claims SOP v1.0, page 2").first()).toBeVisible();
  await expect(agent.getByText("1 policy excerpt(s) cited of 2 retrieved; 1 cited id(s) were not among the retrieved excerpts and were dropped")).toBeVisible();

  // Reviewers see the same excerpt where they decide.
  await reviewer.goto("/approvals");
  const card = reviewer.locator("div.rounded-md.border").filter({ hasText: "E2E Policy Cite" }).first();
  await card.getByText("Policy excerpts (1)").click();
  await expect(card.locator("blockquote")).toContainText("outer carton photo");
});
