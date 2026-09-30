import { describe, expect, it } from "vitest";
import { contentDisposition } from "@/lib/http";

describe("contentDisposition", () => {
  it("gives an ASCII fallback and an RFC 5987 encoded name", () => {
    expect(contentDisposition("attachment", "poškodený vázu.png")).toBe(
      `attachment; filename="po_koden_ v_zu.png"; filename*=UTF-8''po%C5%A1koden%C3%BD%20v%C3%A1zu.png`,
    );
  });
  it("cannot break out of the header or the quoted string", () => {
    const h = contentDisposition("inline", 'a"; x=1\r\nSet-Cookie: y=1.png');
    expect(h).not.toMatch(/[\r\n]/);
    expect(h.split(";")[1]).toContain('filename="a__ x=1__Set-Cookie: y=1.png"');
    expect(h).toContain("%22");
  });
  it("escapes the characters encodeURIComponent leaves alone", () => {
    expect(contentDisposition("attachment", "a'b(c)*.png")).toContain("a%27b%28c%29%2A.png");
  });
});
