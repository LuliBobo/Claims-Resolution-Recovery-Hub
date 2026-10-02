import { crc32, inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { demoBrokenItemPng, demoCartonPng, demoShippingLabelPng } from "@/lib/png-build";
import { sniffContentType } from "@/lib/file-sniff";
import { resolveTour, stepDone, stepHref, TOUR_STEPS, totalSeconds } from "@/server/demo/tour";

const ctx = { vaseId: "v-1", wrongId: "w-1" };

describe("tour definition", () => {
  it("has contiguous steps 0..12 in script order", () => {
    expect(TOUR_STEPS.map((s) => s.n)).toEqual(Array.from({ length: 13 }, (_, i) => i));
    expect(TOUR_STEPS.map((s) => s.title)).toEqual([
      "Opening", "Dashboard", "Cases inbox", "Case understanding", "Evidence checker", "Policy support", "Resolution recommendation",
      "Customer reply draft", "Recovery draft", "Human review", "Audit timeline", "Analytics", "Closing",
    ]);
  });

  it("fits the presentation script's 3.5-4.5 minute budget", () => {
    expect(totalSeconds()).toBeGreaterThanOrEqual(210);
    expect(totalSeconds()).toBeLessThanOrEqual(270);
    expect(totalSeconds([])).toBe(0);
  });

  it("every step has something to show and say, and exactly one has the demo shortcut", () => {
    for (const s of TOUR_STEPS) {
      expect(s.show.length).toBeGreaterThan(0);
      expect(s.say.length).toBeGreaterThan(20);
      expect(s.seconds).toBeGreaterThan(0);
    }
    expect(TOUR_STEPS.filter((s) => s.action).map((s) => s.n)).toEqual([6]);
  });

  it("links to the real page with the step number and anchor, falling back to the inbox before data exists", () => {
    const by = (n: number) => TOUR_STEPS.find((s) => s.n === n)!;
    expect(stepHref(by(1), ctx)).toBe("/operations-summary?demo=1");
    expect(stepHref(by(4), ctx)).toBe("/cases/v-1?demo=4#evidence");
    expect(stepHref(by(8), ctx)).toBe("/cases/v-1?demo=8#recovery");
    expect(stepHref(by(10), ctx)).toBe("/cases/v-1?demo=10#audit");
    expect(stepHref(by(9), ctx)).toBe("/approvals?demo=9");
    expect(stepHref(by(3), { vaseId: null, wrongId: null })).toBe("/cases?demo=3");
  });

  it("only the action steps report progress", () => {
    const by = (n: number) => TOUR_STEPS.find((s) => s.n === n)!;
    expect(TOUR_STEPS.filter((s) => stepDone(s, { cartonAdded: true, approvalsDecided: true }) !== null).map((s) => s.n)).toEqual([6, 9]);
    expect(stepDone(by(6), { cartonAdded: false, approvalsDecided: true })).toBe(false);
    expect(stepDone(by(9), { cartonAdded: true, approvalsDecided: false })).toBe(false);
  });

  it("resolveTour hands the client ready links and no functions", () => {
    const r = resolveTour(ctx);
    expect(r).toHaveLength(13);
    expect(r[4]).toMatchObject({ n: 4, href: "/cases/v-1?demo=4#evidence", action: null });
    expect(r[6].action).toBe("add-carton");
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
});

describe("demo PNGs", () => {
  for (const [name, make] of [["broken item", demoBrokenItemPng], ["shipping label", demoShippingLabelPng], ["carton", demoCartonPng]] as const) {
    it(`${name} is a valid PNG: signature, chunk CRCs, size and decodable pixels`, () => {
      const png = Buffer.from(make());
      expect(sniffContentType(png)).toBe("image/png");
      let off = 8;
      let width = 0, height = 0;
      const idat: Buffer[] = [];
      while (off < png.length) {
        const len = png.readUInt32BE(off);
        const type = png.subarray(off + 4, off + 8).toString("ascii");
        const data = png.subarray(off + 8, off + 8 + len);
        expect(png.readUInt32BE(off + 8 + len)).toBe(crc32(png.subarray(off + 4, off + 8 + len)));
        if (type === "IHDR") [width, height] = [data.readUInt32BE(0), data.readUInt32BE(4)];
        if (type === "IDAT") idat.push(data);
        off += 12 + len;
      }
      expect([width, height]).toEqual([320, 200]);
      expect(inflateSync(Buffer.concat(idat)).length).toBe((320 * 3 + 1) * 200);
      expect(png.length).toBeLessThan(50_000);
    });
  }
  it("the three images differ from each other", () => {
    const [a, b, c] = [demoBrokenItemPng(), demoShippingLabelPng(), demoCartonPng()].map((x) => Buffer.from(x).toString("base64"));
    expect(new Set([a, b, c]).size).toBe(3);
  });
});
