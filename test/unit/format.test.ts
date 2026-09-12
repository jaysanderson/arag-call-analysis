import { describe, expect, it } from "vitest";
import { colorFor, fmtDate, fmtDateTime, fmtTime, pct, SENTIMENT_COLOR } from "@/lib/format";

describe("fmtTime", () => {
  it("formats seconds as m:ss", () => {
    expect(fmtTime(0)).toBe("0:00");
    expect(fmtTime(9)).toBe("0:09");
    expect(fmtTime(61)).toBe("1:01");
    expect(fmtTime(3599)).toBe("59:59");
  });

  it("clamps negatives and non-finite values to zero", () => {
    expect(fmtTime(-5)).toBe("0:00");
    expect(fmtTime(Number.NaN)).toBe("0:00");
    expect(fmtTime(Number.POSITIVE_INFINITY)).toBe("0:00");
  });
});

describe("date formatting", () => {
  it("pins locale and timezone so server and client render identically", () => {
    expect(fmtDate("2026-06-02T15:12:00Z")).toBe("Jun 2, 2026");
    expect(fmtDateTime("2026-06-02T15:12:00Z")).toBe("Jun 2, 3:12 PM");
  });

  it("never throws on missing or invalid input", () => {
    expect(fmtDate(undefined)).toBe("n/a");
    expect(fmtDate("not-a-date")).toBe("n/a");
    expect(fmtDateTime(undefined)).toBe("n/a");
    expect(fmtDateTime("nope")).toBe("n/a");
  });
});

describe("pct", () => {
  it("renders a ratio as a percentage", () => {
    expect(pct(0)).toBe("0%");
    expect(pct(0.5)).toBe("50%");
    expect(pct(0.1234, 1)).toBe("12.3%");
  });
});

describe("colorFor", () => {
  it("is stable for the same key", () => {
    expect(colorFor("Claims")).toBe(colorFor("Claims"));
  });

  it("always returns a class from the palette", () => {
    for (const key of ["", "a", "Billing & Payments", "x".repeat(200)]) {
      expect(colorFor(key)).toMatch(/^bg-\w+-100 text-\w+-800$/);
    }
  });
});

describe("SENTIMENT_COLOR", () => {
  it("covers every sentiment the taxonomy allows", () => {
    for (const s of ["Positive", "Neutral", "Negative", "Mixed"]) {
      expect(SENTIMENT_COLOR[s]).toBeTruthy();
    }
  });
});
