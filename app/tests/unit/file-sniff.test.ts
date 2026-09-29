import { describe, expect, it } from "vitest";
import { sniffContentType } from "@/lib/file-sniff";

const bytes = (...n: number[]) => new Uint8Array(n);

describe("sniffContentType", () => {
  it("detects common binary formats from magic bytes", () => {
    expect(sniffContentType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toBe("image/jpeg");
    expect(sniffContentType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png");
    expect(sniffContentType(new TextEncoder().encode("%PDF-1.7\n\0"))).toBe("application/pdf");
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(sniffContentType(webp)).toBe("image/webp");
  });
  it("detects plain text, including multi-byte UTF-8", () => {
    expect(sniffContentType(new TextEncoder().encode("Dobrý deň, tovar prišiel poškodený"))).toBe("text/plain");
  });
  it("rejects unknown binary content, e.g. an executable renamed to .jpg", () => {
    expect(sniffContentType(bytes(0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00))).toBeNull();
  });
});
