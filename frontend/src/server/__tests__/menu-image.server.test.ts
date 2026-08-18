import { describe, expect, it } from "vitest";
import { MAX_MENU_IMAGE_BYTES } from "@/domain/menu";
import { decodeMenuImage } from "../menu-management.server";

describe("decodeMenuImage", () => {
  it("accepts an encoded image whose bytes match the declared type", () => {
    const webp = Buffer.from("524946460400000057454250", "hex");
    expect(decodeMenuImage("image/webp", webp.toString("base64"))).toEqual(webp);
  });

  it("rejects content-type spoofing", () => {
    const jpeg = Buffer.from("ffd8ff00", "hex");
    expect(() => decodeMenuImage("image/png", jpeg.toString("base64"))).toThrow(
      "does not match",
    );
  });

  it("rejects images above the stored-size limit", () => {
    const oversized = Buffer.alloc(MAX_MENU_IMAGE_BYTES + 1);
    oversized.set(Buffer.from("ffd8ff", "hex"));
    expect(() => decodeMenuImage("image/jpeg", oversized.toString("base64"))).toThrow(
      "no larger than 700 KB",
    );
  });
});
