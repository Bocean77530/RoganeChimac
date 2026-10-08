import { describe, expect, it } from "vitest";
import { canCheckoutCart, useCart } from "./cart-store";

const line = {
  itemId: "bibimbap",
  name: "Bibimbap",
  image: "",
  basePrice: 1500,
  quantity: 1,
  modifiers: [],
};

describe("cart table context", () => {
  it("clears pickup food when entering a table and keeps a validated table across checkout links", () => {
    useCart.getState().switchToPickup();
    useCart.getState().addLine(line);
    expect(useCart.getState().lines).toHaveLength(1);
    useCart
      .getState()
      .setTable({ tableCode: "signed-one", tableId: "table-one", tableLabel: "Table 1" });
    expect(useCart.getState().lines).toHaveLength(0);
    useCart.getState().addLine(line);
    useCart
      .getState()
      .setTable({ tableCode: "signed-one", tableId: "table-one", tableLabel: "Table 1" });
    expect(useCart.getState().lines).toHaveLength(1);
    useCart.getState().clear();
    expect(useCart.getState().fulfillment).toMatchObject({ type: "dine_in", tableId: "table-one" });
    useCart.getState().addLine(line);
    useCart
      .getState()
      .setTable({ tableCode: "signed-two", tableId: "table-two", tableLabel: "Table 2" });
    expect(useCart.getState().lines).toHaveLength(0);
    useCart.getState().switchToPickup();
    expect(useCart.getState().fulfillment).toEqual({ type: "pickup" });
  });

  it("isolates table A immediately when a different or empty table code is scanned", () => {
    useCart.getState().switchToPickup();
    useCart.getState().setTable({ tableCode: "signed-A", tableId: "A", tableLabel: "Table A" });
    useCart.getState().addLine(line);
    useCart.getState().beginTableScan("signed-B");
    expect(useCart.getState().fulfillment).toEqual({
      type: "table_pending",
      tableCode: "signed-B",
    });
    expect(useCart.getState().lines).toHaveLength(0);
    expect(canCheckoutCart(useCart.getState())).toBe(false);
    useCart.getState().addLine(line);
    useCart.getState().beginTableScan("");
    expect(useCart.getState().fulfillment).toEqual({ type: "table_pending", tableCode: "" });
    expect(useCart.getState().lines).toHaveLength(0);
    expect(canCheckoutCart(useCart.getState())).toBe(false);
  });

  it("blocks checkout while the same table is revalidated and restores its food only after success", () => {
    useCart.getState().switchToPickup();
    const table = { tableCode: "signed-A", tableId: "A", tableLabel: "Table A" };
    useCart.getState().setTable(table);
    useCart.getState().addLine(line);
    useCart.getState().beginTableScan(table.tableCode);
    expect(useCart.getState().lines).toHaveLength(1);
    expect(canCheckoutCart(useCart.getState())).toBe(false);
    useCart.getState().setTable(table);
    expect(canCheckoutCart(useCart.getState())).toBe(true);
  });
});
