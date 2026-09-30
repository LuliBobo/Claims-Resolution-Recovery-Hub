/** RFC 6266 / 5987 Content-Disposition with an ASCII fallback; safe against header injection. */
export function contentDisposition(kind: "inline" | "attachment", filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\;]/g, "_");
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export const INLINE_SAFE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
