import { describe, expect, it } from "vitest";
import { signTableCode, verifyTableCode } from "../table-codes.server";

const secret = "stage-one-test-secret-with-at-least-32-characters";
const restaurantId = "11111111-1111-4111-8111-111111111111";
const anotherRestaurantId = "22222222-2222-4222-8222-222222222222";
const tableId = "33333333-3333-4333-8333-333333333333";

describe("signed table codes", () => {
  it("binds a table and version to one restaurant", () => {
    const token = signTableCode({ restaurantId, tableId, tokenVersion: 3 }, secret);
    expect(verifyTableCode(token, restaurantId, secret)).toEqual({ tableId, tokenVersion: 3 });
    expect(verifyTableCode(token, anotherRestaurantId, secret)).toBeNull();
  });

  it("rejects changed table IDs, versions and signatures", () => {
    const token = signTableCode({ restaurantId, tableId, tokenVersion: 3 }, secret);
    expect(
      verifyTableCode(token.replace(tableId, anotherRestaurantId), restaurantId, secret),
    ).toBeNull();
    expect(verifyTableCode(token.replace(".3.", ".4."), restaurantId, secret)).toBeNull();
    expect(verifyTableCode(`${token.slice(0, -1)}A`, restaurantId, secret)).toBeNull();
    expect(verifyTableCode(token, restaurantId, `${secret}wrong`)).toBeNull();
  });
});
