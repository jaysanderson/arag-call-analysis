/**
 * The pure logic behind the calls list's furniture: the column catalogue and the two preferences
 * that shape it, and the query normalisation that decides which saved view the current URL is.
 *
 * The normalisation is deliberately duplicated between the browser (`components/calls/view-query`)
 * and the server (`services/views`), because the server module cannot be bundled for the browser.
 * The most important assertions here are the ones that pin the two copies together: if they drift,
 * the screen shows "modified" for a view it has only just saved.
 */
import { describe, expect, it } from "vitest";
import {
  CALL_COLUMNS,
  DEFAULT_COLUMNS,
  describeTable,
  isSortKey,
  parseColumns,
  parseDensity,
  serialiseColumns,
  toggleColumn,
  visibleColumns,
} from "@/components/calls/columns";
import {
  matchingView,
  normaliseCallsQuery,
  type SavedView,
  VIEW_PARAMS,
  viewState,
} from "@/components/calls/view-query";
import { CALL_SORTS } from "@/services/calls";
import { normaliseQuery, VIEW_PARAMS as SERVER_VIEW_PARAMS } from "@/services/views";

const view = (over: Partial<SavedView> & { id: string; query: string }): SavedView => ({
  name: over.name ?? `View ${over.id}`,
  href: `/calls?${over.query}`,
  createdISO: "2026-06-01T00:00:00.000Z",
  ...over,
});

describe("the client and the server agree about a view's query", () => {
  it("carries the same parameter allowlist", () => {
    expect([...VIEW_PARAMS]).toEqual([...SERVER_VIEW_PARAMS]);
  });

  const cases = [
    "",
    "?q=refund&label=sentiment%2FNegative",
    "label=b&label=a&q=x",
    "page=4&page_size=50&sort=duration&order=asc",
    "q=&agent=&queue=Billing",
    "from=2026-06-01T00:00:00.000Z&to=2026-06-30T23:59:59.999Z",
    "mode=browse&lifecycle=failed&media_type=audio",
    `q=${"x".repeat(400)}`,
    `${Array.from({ length: 40 }, (_, i) => `label=l${i}`).join("&")}`,
    "nonsense=1&label=sentiment%2FNegative&utm_source=email",
  ];
  for (const input of cases) {
    it(`normalises ${input.slice(0, 40) || "(empty)"} identically`, () => {
      expect(normaliseCallsQuery(input)).toBe(normaliseQuery(input));
    });
  }
});

describe("normaliseCallsQuery", () => {
  it("drops parameters a view may not carry", () => {
    expect(normaliseCallsQuery("q=a&page=3&ids=x&min_duration=10")).toBe("q=a");
  });

  it("puts the allowlisted parameters in a fixed order, so the order they were picked cannot matter", () => {
    const a = normaliseCallsQuery("order=asc&sort=duration&agent=Dana&q=refund");
    const b = normaliseCallsQuery("q=refund&agent=Dana&sort=duration&order=asc");
    expect(a).toBe(b);
    expect(a).toBe("q=refund&agent=Dana&sort=duration&order=asc");
  });

  it("keeps every label but only the last of a single-valued parameter", () => {
    expect(normaliseCallsQuery("label=a&label=b&agent=One&agent=Two")).toBe("label=a&label=b&agent=Two");
  });

  it("treats an empty value as absent, so a cleared search box is not a filter", () => {
    expect(normaliseCallsQuery("q=&label=a")).toBe("label=a");
  });
});

describe("matchingView", () => {
  const views = [
    view({ id: "1", query: "label=sentiment%2FNegative&agent=Dana" }),
    view({ id: "2", query: "lifecycle=failed" }),
  ];

  it("matches regardless of parameter order or of parameters a view cannot carry", () => {
    expect(matchingView(views, "agent=Dana&label=sentiment/Negative&page=7")?.id).toBe("1");
  });

  it("does not match a query with an extra filter", () => {
    expect(matchingView(views, "agent=Dana&label=sentiment/Negative&q=refund")).toBeNull();
  });

  it("never matches the unfiltered list", () => {
    expect(matchingView(views, "")).toBeNull();
    expect(matchingView(views, "page=2")).toBeNull();
  });
});

describe("viewState", () => {
  const views = [view({ id: "1", name: "Escalations", query: "lifecycle=failed" })];

  it("reports an exact match as unmodified", () => {
    expect(viewState(views, "lifecycle=failed&page=2", null)).toEqual({ active: views[0], modified: false });
  });

  it("holds on to the open view once a filter changes, so it can still be updated", () => {
    const state = viewState(views, "lifecycle=failed&q=refund", "1");
    expect(state.active?.id).toBe("1");
    expect(state.modified).toBe(true);
  });

  it("lets go of the view when every filter is cleared", () => {
    expect(viewState(views, "", "1")).toEqual({ active: null, modified: false });
  });

  it("lets go of a view that has since been deleted", () => {
    expect(viewState(views, "q=refund", "gone")).toEqual({ active: null, modified: false });
  });
});

describe("the column catalogue", () => {
  it("only claims a column is sortable when the service can sort on it", () => {
    for (const col of CALL_COLUMNS) {
      if (col.sortKey) expect(CALL_SORTS as readonly string[]).toContain(col.sortKey);
    }
  });

  it("has exactly one mandatory column and every default is a real one", () => {
    expect(CALL_COLUMNS.filter((c) => c.mandatory).map((c) => c.key)).toEqual(["call"]);
    const keys = new Set(CALL_COLUMNS.map((c) => c.key));
    for (const key of DEFAULT_COLUMNS) expect(keys.has(key)).toBe(true);
  });

  it("uses unique keys and labels", () => {
    expect(new Set(CALL_COLUMNS.map((c) => c.key)).size).toBe(CALL_COLUMNS.length);
    expect(new Set(CALL_COLUMNS.map((c) => c.label)).size).toBe(CALL_COLUMNS.length);
  });

  it("offers the optional columns the call record already carries", () => {
    const keys = CALL_COLUMNS.map((c) => c.key);
    for (const key of ["queue", "csat", "compliance", "lob", "media", "complaint", "escalated"])
      expect(keys).toContain(key);
  });

  it("agrees with the service about which sort keys exist", () => {
    expect(isSortKey("duration")).toBe(true);
    expect(isSortKey("title")).toBe(true);
    expect(isSortKey("nonsense")).toBe(false);
    expect(isSortKey(null)).toBe(false);
  });
});

describe("parseColumns", () => {
  it("falls back to the default when there is no preference", () => {
    expect(parseColumns(null)).toEqual([...DEFAULT_COLUMNS]);
    expect(parseColumns(undefined)).toEqual([...DEFAULT_COLUMNS]);
  });

  it("falls back to the default for a corrupt or unrecognisable preference", () => {
    expect(parseColumns("not json")).toEqual([...DEFAULT_COLUMNS]);
    expect(parseColumns('{"call":true}')).toEqual([...DEFAULT_COLUMNS]);
    expect(parseColumns('["nope","gone"]')).toEqual([...DEFAULT_COLUMNS]);
  });

  it("drops keys it does not recognise but keeps the ones it does", () => {
    expect(parseColumns('["call","csat","from-an-older-build"]')).toEqual(["call", "csat"]);
  });

  it("always restores the mandatory column, however the preference was written", () => {
    expect(parseColumns('["sentiment"]')).toEqual(["call", "sentiment"]);
    expect(parseColumns("[]")).toEqual(["call"]);
  });

  it("returns the catalogue's order, not the stored order", () => {
    expect(parseColumns('["status","created","call"]')).toEqual(["call", "created", "status"]);
  });

  it("round-trips through serialiseColumns", () => {
    const chosen = ["call", "created", "compliance"];
    expect(parseColumns(serialiseColumns(chosen))).toEqual(chosen);
  });
});

describe("toggleColumn", () => {
  it("adds and removes an optional column", () => {
    const on = toggleColumn(["call", "created"], "csat");
    expect(on).toContain("csat");
    expect(toggleColumn(on, "csat")).not.toContain("csat");
  });

  it("refuses to hide the mandatory column", () => {
    expect(toggleColumn(["call", "created"], "call")).toEqual(["call", "created"]);
  });

  it("ignores a key that is not a column at all", () => {
    expect(toggleColumn(["call"], "nope")).toEqual(["call"]);
  });

  it("keeps the catalogue's order when a column is added back", () => {
    expect(toggleColumn(["call", "status"], "created")).toEqual(["call", "created", "status"]);
  });
});

describe("visibleColumns", () => {
  it("resolves keys to definitions in the catalogue's order", () => {
    expect(visibleColumns(["status", "created"]).map((c) => c.key)).toEqual(["call", "created", "status"]);
  });
});

describe("parseDensity", () => {
  it("only honours the one value that changes anything", () => {
    expect(parseDensity("compact")).toBe("compact");
    expect(parseDensity("comfortable")).toBe("comfortable");
    expect(parseDensity(null)).toBe("comfortable");
    expect(parseDensity("COMPACT")).toBe("comfortable");
  });
});

describe("describeTable", () => {
  const columns = visibleColumns([...DEFAULT_COLUMNS]);

  it("names the row count, the column count and the sort column's label", () => {
    expect(describeTable({ total: 24, sortKey: "created", order: "desc", columns })).toBe(
      "24 calls, 8 columns shown, sorted by Date, descending",
    );
  });

  it("reads correctly for a single call", () => {
    expect(describeTable({ total: 1, sortKey: "title", order: "asc", columns })).toBe(
      "1 call, 8 columns shown, sorted by Call, ascending",
    );
  });

  it("says so when the rows are ordered by a column that is not on screen", () => {
    expect(describeTable({ total: 3, sortKey: "csat", order: "desc", columns })).toContain(
      "sorted by CSAT (column hidden), descending",
    );
  });

  it("follows the column count as columns are hidden", () => {
    expect(
      describeTable({ total: 3, sortKey: "created", order: "desc", columns: visibleColumns(["created"]) }),
    ).toContain("2 columns shown");
  });
});
