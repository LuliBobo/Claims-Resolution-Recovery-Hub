# 05 — Migration dependencies

Reconstruction plan from the supplied Luo inventory (2026-09-25), not a claim that a CSV importer or source-code export exists.

## Suggested parent-before-child order

1. Order and PolicyDocument.
2. Shipment after its Order; Rule after its optional PolicyDocument.
3. CustomerCase after related Order/Shipment, when those links exist.
4. Attachment, ResolutionProposal, RecoveryDraft and AuditEvent after CustomerCase.
5. HumanApproval after its CustomerCase and linked ResolutionProposal or RecoveryDraft.
6. InsightRecord: prefer recomputation using ported rules rather than treating old aggregates as authoritative.

AuditEvent is historical evidence: preserve it in a controlled migration even if inserted after operational records. **Do not drop historical events merely because downstream processing does not require them.** No bulk import mechanism or full row-level export was verified by this inventory. Resolve source IDs to target IDs explicitly; do not infer relationships from customer names.

## Behaviour not transferred by data copy

Runtime rule matching uses type values, not a FK. The DPD evidence gate depends on matching a particular policy and on interpreting existing Attachment fields; preserve that logic through explicit target tests. A denormalized case recommendation is written by create/regenerate paths, so target code must manage its consistency. Missing creation timestamps and lack of an active-proposal marker require an explicit design decision; never infer chronology from insertion/list order alone.

LLM generation, classification/evidence judgement, file analysis, scheduled jobs, report generation and storage need target implementations. Original prompt text and complete API signatures were not included in the supplied public inventory. Existing `sent` status is manual attestation, not an external email or carrier API call. No GitHub, e-commerce, carrier or CRM integration was configured at inventory time.

## Storage and publication

Verify export, retention and deletion of binary attachments separately with the platform. Never put raw customer rows, attachment binaries, case narratives, credentials, internal sensitivity reviews or unsanitized screenshots into a public GitHub repository. Publish only reviewed documentation and genuinely synthetic fixtures. Migration is not complete when documentation is committed: restore relationships, execute acceptance tests and compare outcomes against the Luo reference implementation.
