import "@tanstack/react-start/server-only";

import { timingSafeEqual } from "node:crypto";

export function requireAdminAccess(candidate: string): void {
  const configured = process.env.ADMIN_ACCESS_TOKEN;
  if (!configured || configured.length < 24) {
    throw new Error("Admin menu access is not configured.");
  }

  const expected = Buffer.from(configured);
  const received = Buffer.from(candidate);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new Error("Invalid admin access token.");
  }
}
