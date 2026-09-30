import { NextResponse } from "next/server";
import { getActor } from "@/lib/session";
import { contentDisposition, INLINE_SAFE_TYPES } from "@/lib/http";
import { db } from "@/server/db";
import { loadAttachmentBytes } from "@/server/storage";

export const dynamic = "force-dynamic";

// Authenticated download. Any signed-in role may read evidence files. The response type is
// the SNIFFED type (never the client-declared one); only images may render inline (?inline=1),
// everything else downloads. nosniff plus a sandboxing CSP neutralize hostile content.
export async function GET(request: Request, ctx: RouteContext<"/api/attachments/[attachmentId]/download">) {
  if (!(await getActor())) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { attachmentId } = await ctx.params;
  const attachment = await db.attachment.findUnique({
    where: { id: attachmentId },
    select: { fileName: true, sniffedContentType: true },
  });
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const bytes = await loadAttachmentBytes(attachmentId);
  if (!bytes) return NextResponse.json({ error: "No file is stored for this attachment (synthetic sample record)" }, { status: 404 });

  const type = attachment.sniffedContentType ?? "application/octet-stream";
  const inline = new URL(request.url).searchParams.get("inline") === "1" && INLINE_SAFE_TYPES.has(type);
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(bytes.length),
      "Content-Disposition": contentDisposition(inline ? "inline" : "attachment", attachment.fileName),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}
