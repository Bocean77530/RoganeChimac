import { describe, expect, it } from "vitest";
import { tableCodeFromHref } from "./table-scan";

describe("explicit table scans", () => {
  it("detects new, empty and cross-page codes without treating an absent code as a scan", () => {
    expect(tableCodeFromHref("/order?table=signed-B", "http://localhost")).toBe("signed-B");
    expect(tableCodeFromHref("/order?table=", "http://localhost")).toBe("");
    expect(tableCodeFromHref("/checkout?table=signed-B", "http://localhost")).toBe("signed-B");
    expect(tableCodeFromHref("/order", "http://localhost")).toBeNull();
  });
});
