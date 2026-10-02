import { NextResponse } from "next/server";
import { getActor } from "@/lib/session";
import { contentDisposition } from "@/lib/http";
import { AuthError } from "@/server/auth";
import { PdfError } from "@/server/policy/extract-pdf";
import { deletePolicyPdf, ingestPolicyPdf, loadPolicyPdf } from "@/server/policy/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST: multipart upload (reviewer/admin), redirects back to the policy page.
// POST with _method=delete removes the PDF. GET: authenticated download (any signed-in role).
export async function POST(request: Request, ctx: RouteContext<"/api/policy-documents/[policyDocumentId]/pdf">) {
  const { policyDocumentId } = await ctx.params;
  const back = (query: string) => NextResponse.redirect(new URL(`/policy-rules?${query}`, request.url), 303);
  const fd = await request.formData();
  try {
    const actor = await getActor();
    if (fd.get("_method") === "delete") {
      await deletePolicyPdf(actor, policyDocumentId);
      return back("pdfOk=removed");
    }
    const file = fd.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
    const r = await ingestPolicyPdf(actor, policyDocumentId, { fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    return back(`pdfOk=${encodeURIComponent(`${r.passageCount} passages from ${r.pageCount} pages${r.emptyPages ? `, ${r.emptyPages} without text` : ""}`)}`);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.code === "UNAUTHENTICATED" ? 401 : 403 });
    if (e instanceof PdfError) return back(`pdfError=${encodeURIComponent(e.message)}`);
    throw e;
  }
}

export async function GET(_request: Request, ctx: RouteContext<"/api/policy-documents/[policyDocumentId]/pdf">) {
  if (!(await getActor())) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { policyDocumentId } = await ctx.params;
  const f = await loadPolicyPdf(policyDocumentId);
  if (!f) return NextResponse.json({ error: "No PDF is stored for this policy document" }, { status: 404 });
  return new Response(f.bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(f.bytes.length),
      "Content-Disposition": contentDisposition("attachment", f.fileName),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}
