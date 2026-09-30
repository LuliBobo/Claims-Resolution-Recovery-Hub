import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("handles CRLF, quoted commas, escaped quotes and embedded newlines", () => {
    const rows = parseCsv('a,b,c\r\n1,"x, y","say ""hi"""\r\n2,"line1\nline2",\r\n');
    expect(rows).toEqual([
      { a: "1", b: "x, y", c: 'say "hi"' },
      { a: "2", b: "line1\nline2", c: "" },
    ]);
  });
  it("handles a missing trailing newline and a BOM", () => {
    expect(parseCsv("﻿a,b\n1,2")).toEqual([{ a: "1", b: "2" }]);
  });
  it("rejects ragged rows and unterminated quotes instead of guessing", () => {
    expect(() => parseCsv("a,b\n1")).toThrow(/expected 2/);
    expect(() => parseCsv('a\n"open')).toThrow(/Unterminated/);
  });
  it("returns nothing for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });
});
