// Detects the real content type from the leading bytes. The client-declared MIME type is
// untrusted; callers store both and flag a mismatch.

const startsWith = (b: Uint8Array, sig: number[], offset = 0) =>
  sig.every((v, i) => b[offset + i] === v);

export function sniffContentType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "application/pdf"; // %PDF
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  // Plain text: no NUL bytes and valid UTF-8 in the sampled prefix.
  const sample = bytes.subarray(0, 4096);
  if (sample.length > 0 && !sample.includes(0)) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(sample);
      return "text/plain";
    } catch {
      // A multi-byte character can be cut off at the end of the sample; retry without the tail.
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(sample.subarray(0, sample.length - 3));
        return "text/plain";
      } catch {
        return null;
      }
    }
  }
  return null;
}

export const ALLOWED_UPLOAD_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
]);

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
