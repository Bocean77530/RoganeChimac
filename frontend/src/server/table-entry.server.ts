import "@tanstack/react-start/server-only";

import type { ServiceResult } from "@/domain/common";
import { withDatabase } from "@/db/client.server";
import { findRestaurantBySlug } from "./repositories/menu-repository.server";
import {
  allowGlobalTableCodeLookup,
  allowVerifiedTableCodeLookup,
  resolveActiveTable,
} from "./table-codes.server";
import { failure, internalError, serviceError, success } from "./service-errors.server";

export type ResolvedTableEntry = {
  type: "dine_in";
  tableId: string;
  tableLabel: string;
  tableCode: string;
};

export async function resolveTableEntry(input: {
  restaurantSlug: string;
  tableCode: string;
}): Promise<ServiceResult<ResolvedTableEntry>> {
  if (!input.restaurantSlug || input.restaurantSlug.length > 80 || input.tableCode.length > 256) {
    return failure(serviceError("TABLE_CODE_INVALID", "This table code is invalid."));
  }
  try {
    return await withDatabase(async (db) => {
      if (!(await allowGlobalTableCodeLookup(db))) {
        return failure(
          serviceError(
            "RATE_LIMITED",
            "Too many table-code checks. Please try again shortly.",
            true,
          ),
        );
      }
      if (input.tableCode.length < 40)
        return failure(serviceError("TABLE_CODE_INVALID", "This table code is invalid."));
      const restaurant = await findRestaurantBySlug(db, input.restaurantSlug);
      if (!restaurant?.dineInEnabled)
        return failure(serviceError("TABLE_CODE_INVALID", "Table ordering is unavailable."));
      if (!(await allowVerifiedTableCodeLookup(db, restaurant.id, input.tableCode))) {
        return failure(
          serviceError(
            "RATE_LIMITED",
            "Too many checks for this table code. Please try again shortly.",
            true,
          ),
        );
      }
      const table = await resolveActiveTable(db, restaurant.id, input.tableCode);
      if (!table)
        return failure(serviceError("TABLE_CODE_INVALID", "This table code is no longer valid."));
      return success({
        type: "dine_in",
        tableId: table.id,
        tableLabel: table.label,
        tableCode: input.tableCode,
      });
    });
  } catch (error) {
    console.error("Failed to resolve table entry", error);
    return failure(internalError());
  }
}
