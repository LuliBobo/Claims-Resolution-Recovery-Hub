// Deterministic workflow scoring (concept: five factors, each 0-3, total 0-15, four routes).
// Pure: no DB, no LLM. Factor values are derived from data the app already holds and are
// recomputed on every read, never stored. The route is a function of the total alone, and no
// language model can influence it. The thresholds and derivations below are PROTOTYPE
// ASSUMPTIONS, not legal or regulatory standards; operators can override any factor.
//
// Higher = more attention needed. Level names follow the concept document.

export const FACTOR_KEYS = ["evidenceCompleteness", "policyClarity", "customerImpact", "businessExposure", "recoveryPotential"] as const;
export type FactorKey = (typeof FACTOR_KEYS)[number];

export const FACTOR_LABELS: Record<FactorKey, string> = {
  evidenceCompleteness: "Evidence completeness",
  policyClarity: "Policy clarity",
  customerImpact: "Customer impact",
  businessExposure: "Business exposure",
  recoveryPotential: "Recovery potential",
};

export const LEVEL_NAMES: Record<FactorKey, readonly [string, string, string, string]> = {
  evidenceCompleteness: ["complete", "minor gap", "material gap", "insufficient"],
  policyClarity: ["explicit rule", "likely rule", "ambiguous rule", "no rule"],
  customerImpact: ["low", "moderate", "significant", "critical"],
  businessExposure: ["negligible", "manageable", "material", "high"],
  recoveryPotential: ["none", "uncertain", "probable", "strong"],
};

/** Order value (currency-agnostic in the prototype) at which exposure steps up: negligible < 50 <= manageable < 150 <= material < 500 <= high. */
export const EXPOSURE_THRESHOLDS = [50, 150, 500] as const;

export type Score = 0 | 1 | 2 | 3;
export type WorkflowRoute =
  | "quick_review"
  | "request_evidence_or_supervisor_check"
  | "human_approval_required"
  | "escalate_no_auto_closure";

export const ROUTE_LABELS: Record<WorkflowRoute, string> = {
  quick_review: "Quick review",
  request_evidence_or_supervisor_check: "Request evidence or supervisor check",
  human_approval_required: "Human approval required",
  escalate_no_auto_closure: "Escalate, no automatic closure",
};

/** 0-4 quick review; 5-7 evidence or supervisor check; 8-10 human approval; 11-15 escalate. */
export function routeFor(total: number): WorkflowRoute {
  if (total <= 4) return "quick_review";
  if (total <= 7) return "request_evidence_or_supervisor_check";
  if (total <= 10) return "human_approval_required";
  return "escalate_no_auto_closure";
}

export interface ScoreInputs {
  evidence: {
    /** Carrier-claims gate applies (damaged delivery + the named SOP). */
    gateApplies: boolean;
    /** Missing required items out of 3, meaningful when gateApplies. */
    gateMissing: number;
    attachmentCount: number;
    sufficientCount: number;
    /** Attachments judged insufficient or still pending review. */
    unresolvedCount: number;
    /** A matched rule states required evidence. */
    ruleRequiresEvidence: boolean;
  };
  policy: {
    matchedRuleCount: number;
    /** Distinct non-empty recommendedResolution values across matched rules. */
    distinctResolutions: number;
    /** Every matched rule is linked to an active policy document. */
    allLinkedToPolicy: boolean;
  };
  priority: "low" | "medium" | "high" | "urgent";
  /** Linked order's value, or null when no order is linked. */
  orderValue: number | null;
  recovery: {
    needed: boolean;
    /** A carrier (or supplier, per case type) is known for the claim. */
    hasCounterparty: boolean;
  };
}

export interface Factor {
  key: FactorKey;
  label: string;
  score: Score;
  level: string;
  reason: string;
}

const clamp = (n: number): Score => Math.max(0, Math.min(3, Math.round(n))) as Score;

function evidence(i: ScoreInputs["evidence"]): { score: Score; reason: string } {
  if (i.gateApplies) {
    return { score: clamp(i.gateMissing), reason: i.gateMissing === 0 ? "All 3 required carrier-claim items are present and sufficient." : `${i.gateMissing} of 3 required carrier-claim items missing or not sufficient.` };
  }
  if (i.attachmentCount === 0) {
    return i.ruleRequiresEvidence
      ? { score: 2, reason: "A matched rule requires evidence and nothing is attached." }
      : { score: 0, reason: "No evidence required by the matched rules." };
  }
  if (i.unresolvedCount === 0) return { score: 0, reason: "All attachments are sufficient or not applicable." };
  return i.sufficientCount > 0
    ? { score: 1, reason: `${i.unresolvedCount} attachment(s) insufficient or pending review; some evidence is sufficient.` }
    : { score: 2, reason: `${i.unresolvedCount} attachment(s) insufficient or pending review; none is sufficient.` };
}

function policy(i: ScoreInputs["policy"]): { score: Score; reason: string } {
  if (i.matchedRuleCount === 0) return { score: 3, reason: "No active rule matches this case type." };
  if (i.distinctResolutions > 1) return { score: 2, reason: "Matching rules recommend different resolutions." };
  if (i.allLinkedToPolicy) return { score: 0, reason: "Matching rule(s) are backed by an active policy document." };
  return { score: 1, reason: "A matching rule has no linked policy document." };
}

const IMPACT: Record<ScoreInputs["priority"], Score> = { low: 0, medium: 1, high: 2, urgent: 3 };

function exposure(orderValue: number | null): { score: Score; reason: string } {
  if (orderValue === null) return { score: 1, reason: "No linked order; value unknown, assumed manageable." };
  const [a, b, c] = EXPOSURE_THRESHOLDS;
  const score: Score = orderValue < a ? 0 : orderValue < b ? 1 : orderValue < c ? 2 : 3;
  return { score, reason: `Order value ${orderValue.toFixed(2)} (thresholds ${a} / ${b} / ${c}).` };
}

function recovery(i: ScoreInputs["recovery"], evidenceSufficient: boolean): { score: Score; reason: string } {
  if (!i.needed) return { score: 0, reason: "No recovery needed." };
  if (!i.hasCounterparty) return { score: 1, reason: "Recovery needed but no carrier or supplier is linked." };
  return evidenceSufficient
    ? { score: 3, reason: "Counterparty known and evidence is sufficient." }
    : { score: 2, reason: "Counterparty known but evidence is not yet sufficient." };
}

export function computeFactors(i: ScoreInputs): Factor[] {
  const evidenceSufficient = i.evidence.gateApplies ? i.evidence.gateMissing === 0 : i.evidence.sufficientCount > 0 && i.evidence.unresolvedCount === 0;
  const raw: Record<FactorKey, { score: Score; reason: string }> = {
    evidenceCompleteness: evidence(i.evidence),
    policyClarity: policy(i.policy),
    customerImpact: { score: IMPACT[i.priority], reason: `Case priority is ${i.priority}.` },
    businessExposure: exposure(i.orderValue),
    recoveryPotential: recovery(i.recovery, evidenceSufficient),
  };
  return FACTOR_KEYS.map((key) => ({ key, label: FACTOR_LABELS[key], score: raw[key].score, level: LEVEL_NAMES[key][raw[key].score], reason: raw[key].reason }));
}

export interface ScoreOverride {
  score: Score;
  reason: string;
  by: string;
  at: string;
}
export type ScoreOverrides = Partial<Record<FactorKey, ScoreOverride>>;

export interface ScoredFactor extends Factor {
  /** The derived score before any override. */
  derivedScore: Score;
  override: ScoreOverride | null;
}

export interface WorkflowScore {
  factors: ScoredFactor[];
  total: number;
  route: WorkflowRoute;
  routeLabel: string;
}

export function scoreCase(inputs: ScoreInputs, overrides: ScoreOverrides = {}): WorkflowScore {
  const factors: ScoredFactor[] = computeFactors(inputs).map((f) => {
    const o = overrides[f.key] ?? null;
    return o
      ? { ...f, derivedScore: f.score, score: o.score, level: LEVEL_NAMES[f.key][o.score], reason: `Operator override: ${o.reason}. Derived: ${f.reason}`, override: o }
      : { ...f, derivedScore: f.score, override: null };
  });
  const total = factors.reduce((s, f) => s + f.score, 0);
  const route = routeFor(total);
  return { factors, total, route, routeLabel: ROUTE_LABELS[route] };
}
