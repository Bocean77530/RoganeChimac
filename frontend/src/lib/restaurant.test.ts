import { describe, expect, it } from "vitest";
import { formatRestaurantHours, isOpenNow } from "./restaurant";

describe("Rogane Chimac trading hours", () => {
  it("supports split lunch and dinner service", () => {
    expect(isOpenNow(new Date("2026-01-05T01:00:00.000Z"))).toBe(true);
    expect(isOpenNow(new Date("2026-01-05T03:30:00.000Z"))).toBe(false);
    expect(isOpenNow(new Date("2026-01-05T06:00:00.000Z"))).toBe(true);
  });

  it("treats Sunday as closed", () => {
    expect(isOpenNow(new Date("2026-01-04T01:00:00.000Z"))).toBe(false);
  });

  it("formats split and closed periods", () => {
    expect(
      formatRestaurantHours([
        { open: "11:00", close: "14:00" },
        { open: "16:30", close: "20:30" },
      ]),
    ).toBe("11:00–14:00, 16:30–20:30");
    expect(formatRestaurantHours([])).toBe("Closed");
  });
});
