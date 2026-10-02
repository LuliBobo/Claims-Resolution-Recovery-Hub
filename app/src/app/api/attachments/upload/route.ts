import { NextResponse } from "next/server";
import { AuthError } from "@/server/auth";
import { getActor } from "@/lib/session";
import { UploadError, uploadAttachment } from "@/server/workflows/upload-attachment";
// LLM calls happen in this route (or the actions it hosts); allow more than the platform default.
export const maxDuration = 60;

// Multipart upload. Thin wrapper over the workflow; redirects back to the case page.
export async function POST(request: Request) {
  const fd = await request.formData();
  const caseId = String(fd.get("caseId") ?? "");
  const file = fd.get("file");
  const back = (query = "") => NextResponse.redirect(new URL(`/cases/${caseId}${query}`, request.url), 303);

  if (!caseId || !(file instanceof File)) {
    return NextResponse.json({ error: "caseId and file are required" }, { status: 400 });
  }
  try {
    await uploadAttachment(await getActor(), {
      caseId,
      fileName: file.name,
      declaredContentType: file.type || "application/octet-stream",
      category: String(fd.get("category") ?? "other"),
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return back();
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.code === "UNAUTHENTICATED" ? 401 : 403 });
    }
    if (e instanceof UploadError) return back(`?uploadError=${encodeURIComponent(e.message)}`);
    throw e;
  }
}
