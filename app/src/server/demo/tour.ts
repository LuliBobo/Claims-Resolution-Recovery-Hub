// The guided tour, as data. Pure, so it is unit-tested: step order, timing and links. Wording follows
// the presentation script in claims-resolution-recovery-hub-demo-script-screen-by-screen.md.

export interface TourContext {
  vaseId: string | null;
  wrongId: string | null;
}

export type TourAction = "add-carton";

export interface TourStep {
  n: number;
  title: string;
  seconds: number;
  /** Path (no query) of the real page this step is shown on. */
  path: (c: TourContext) => string;
  anchor?: string;
  show: string[];
  say: string;
  action?: TourAction;
}

const vase = (c: TourContext) => (c.vaseId ? `/cases/${c.vaseId}` : "/cases");

export const TOUR_STEPS: TourStep[] = [
  {
    n: 0, title: "Opening", seconds: 10, path: () => "/demo",
    show: ["This page. Keep the dashboard ready in the next tab."],
    say: "Small e-commerce teams still handle complaints through inboxes, spreadsheets and manual follow-up. We turn one complaint into a customer resolution and a recovery action, with AI assistance and human control.",
  },
  {
    n: 1, title: "Dashboard", seconds: 15, path: () => "/operations-summary",
    show: ["Open cases", "Cases waiting for evidence", "Pending approvals", "Recovery opportunities"],
    say: "This is the operations view: open cases, missing evidence, approval bottlenecks and recovery opportunities, at a glance.",
  },
  {
    n: 2, title: "Cases inbox", seconds: 15, path: () => "/cases",
    show: ["Filter and search the queue", "The DEMO flagship case: a Spanish complaint about a broken vase"],
    say: "Here is the inbox. Our flagship case is a Spanish complaint about a broken vase.",
  },
  {
    n: 3, title: "Case understanding", seconds: 20, path: vase,
    show: ["Spanish complaint and the English internal summary", "Classified as damaged delivery, with confidence", "Linked order and shipment"],
    say: "The app detects the language, writes an internal English summary, classifies the issue as damaged delivery and links the original order and shipment.",
  },
  {
    n: 4, title: "Evidence checker", seconds: 20, path: vase, anchor: "evidence",
    show: ["Carrier-claim checklist: label and damaged item present, outer carton missing", "Workflow score and why", "The Spanish evidence request, drafted for a person to send"],
    say: "The product photo and the label are here, but the outer-box photo is missing, which matters for a carrier claim. The system shows exactly what is missing and drafts the request to the customer in Spanish.",
  },
  {
    n: 5, title: "Policy support", seconds: 20, path: vase, anchor: "proposals",
    show: ["The current proposal and the evidence gate", "Policy excerpts: verbatim passage, document, version and page"],
    say: "Instead of a black box, it retrieves the relevant internal policy and shows the exact passage that supports the next step.",
  },
  {
    n: 6, title: "Resolution recommendation", seconds: 20, path: vase, anchor: "proposals", action: "add-carton",
    show: ["Use the demo shortcut to add the customer's outer-box photo", "The gate clears and a new proposal replaces the old one", "In the workflow score, evidence completeness goes to 0 (complete) and recovery potential rises to strong"],
    say: "Once the customer sends the missing photo, the checklist completes, the evidence factor in the workflow score goes to zero and the proposal becomes a replacement. The earlier proposal is kept, marked superseded.",
  },
  {
    n: 7, title: "Customer reply draft", seconds: 20, path: vase, anchor: "proposals",
    show: ["Open the customer reply draft: Spanish", "The internal rationale stays in English"],
    say: "The reply is written in the customer's own language, while the operator keeps an English summary. That makes the workflow multilingual without the team working across languages by hand.",
  },
  {
    n: 8, title: "Recovery draft", seconds: 25, path: vase, anchor: "recovery",
    show: ["Counterparty and claim type", "Estimated recoverable value", "Draft text in English"],
    say: "This is the differentiator. The same complaint also prepares a carrier recovery draft, so the merchant can try to recover the loss instead of only absorbing it.",
  },
  {
    n: 9, title: "Human review", seconds: 20, path: () => "/approvals",
    show: ["Approve, Approve with edits, Request more evidence, Reject", "Policy excerpts and the score are shown where the decision is made", "Approve the proposal and the recovery draft"],
    say: "AI structures the case and prepares the action, but a human stays in control. Important actions are explicitly reviewed before anything moves forward. Nothing is sent by the system.",
  },
  {
    n: 10, title: "Audit timeline", seconds: 20, path: vase, anchor: "audit",
    show: ["Case created, evidence judged, proposal generated, superseded", "Recovery draft created, approvals recorded"],
    say: "Every important step is logged and the log can only be added to, never edited. Complaint handling needs speed, consistency and a record of what happened.",
  },
  {
    n: 11, title: "Analytics", seconds: 20, path: () => "/insights",
    show: ["Repeated damage for the same SKU and carrier", "Trend: up", "Weekly report"],
    say: "Over time the system shows which products, suppliers or carriers cause repeated losses, so the team can reduce future claims.",
  },
  {
    n: 12, title: "Closing", seconds: 10, path: () => "/demo",
    show: ["Optional: the second scenario, a wrong item from a supplier"],
    say: "One complaint in, two controlled outcomes out.",
  },
];

export const stepHref = (s: TourStep, c: TourContext) => `${s.path(c)}?demo=${s.n}${s.anchor ? `#${s.anchor}` : ""}`;
export const totalSeconds = (steps: readonly TourStep[] = TOUR_STEPS) => steps.reduce((t, s) => t + s.seconds, 0);

export interface TourState {
  cartonAdded: boolean;
  approvalsDecided: boolean;
}

/** null = informational step (nothing to complete). */
export function stepDone(s: TourStep, state: TourState): boolean | null {
  if (s.n === 6) return state.cartonAdded;
  if (s.n === 9) return state.approvalsDecided;
  return null;
}

/** Steps as shown to the client: wording, timing and a ready link, with the ids filled in. */
export function resolveTour(c: TourContext, steps: readonly TourStep[] = TOUR_STEPS) {
  return steps.map((s) => ({ n: s.n, title: s.title, seconds: s.seconds, show: s.show, say: s.say, action: s.action ?? null, href: stepHref(s, c) }));
}
