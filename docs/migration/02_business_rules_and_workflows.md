# 02 — Business rules and workflows

Migration reference from the supplied Luo inventory, dated 2026-09-25. Behaviour described here must be checked against the current deployment before production use.

## Intake and review

Cases are entered manually in the inspected build; no inbound email integration was configured. Intake may translate/summarise non-English complaints and classify missing case type/priority. Active rules matching case type and their active linked policies provide context to proposal generation. A proposal requiring human sign-off receives a HumanApproval; a recovery draft may be generated with its own approval. Case status can move to `awaiting_approval`. `resolved`, `escalated`, and `closed` are manually edited states. AuditEvent records carry transition details. Do not assume every regeneration creates precisely one proposal/approval: repeated test runs left multiple rows for one case.

## Evidence gate

For `damaged_delivery` cases matched to the applicable DPD carrier-claims policy, evidence sufficiency is derived transiently from linked Attachment records; no persistent evidenceComplete field was reported. **Actual Luo attachment enums** are `photo_evidence`, `invoice`, `shipping_label`, `correspondence`, `other` for category and `pending_review`, `sufficient`, `insufficient`, `not_applicable` for evidence status. Do not invent per-photo category enums or a `present` enum. The three photographic requirements are damaged item, outer carton, and shipping label; the exact mapping of filename/AI notes, category and sufficiency to each requirement needs the generated handler or a live test for full reconstruction. The evidence checklist is refreshed on case retrieval; proposal text is brought into line on regeneration.

When required evidence is incomplete, the recommendation should be `Request Missing Evidence`, with each requirement shown as missing/present and no claim-ready assertion. When complete, use the normal carrier-claim recommendation with evidence confirmation. Human approval remains required. Sending/marking a RecoveryDraft as sent requires both complete applicable evidence and an approved draft; check the current backend handler as well as UI gating. In the inspected build, `sent` is a manual attestation, not an email/carrier transmission. Matching the policy by name is a migration risk if the name changes.

## Attachment lifecycle

Uploads store a file reference and apply file analysis/evidence assessment. The reported subsequent build removed a legacy one-off deletion exception; its deletion action now accepts only `file_name` beginning `test_` or `synthetic_` (case-sensitive). It removes a single database row and does not create an audit event. Whether the binary is removed is unverified. This test cleanup mechanism should not be treated as a general production delete policy.

## Insights and reporting

Nightly/manual insight recomputation replaces derived InsightRecord rows. A Monday/manual report writes Markdown to the Knowledge Base. An operations-summary backend serves read-only dashboard metrics. A narrow correction action can adjust a RecoveryDraft estimated recoverable value and record an audit event. Exact aggregation windows and formulas require code-level export or focused validation; the inventory alone does not fully specify them.

## Migration design cautions

Preserve approval and audit history; do not infer a canonical current proposal from list order when no timestamp/current marker exists. Build explicit authorisation and audit behaviour in the target rather than copying the test deletion guard. No real outbound integrations were connected in the inventoried workspace.
