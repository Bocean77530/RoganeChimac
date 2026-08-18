import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { dietTags, MAX_MENU_IMAGE_BYTES, menuImageContentTypes } from "@/domain/menu";

const restaurantSchema = z.object({
  restaurantSlug: z.string().trim().min(1).max(80),
});

const adminSchema = z.object({
  adminToken: z.string().min(1).max(512),
});

const createSchema = restaurantSchema.merge(adminSchema).extend({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  koreanName: z.string().trim().max(120).optional(),
  description: z.string().trim().min(5).max(1_000),
  priceCents: z.number().int().min(0).max(1_000_000),
  imageKey: z.string().trim().min(1).max(100),
  dietTags: z.array(z.enum(dietTags)).max(dietTags.length),
  spiceLevel: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  popular: z.boolean(),
  chefsPick: z.boolean(),
  soldOut: z.boolean(),
});

const deleteSchema = restaurantSchema.merge(adminSchema).extend({
  menuItemId: z.string().uuid(),
});

const uploadImageSchema = deleteSchema.extend({
  contentType: z.enum(menuImageContentTypes),
  base64Data: z
    .string()
    .min(4)
    .max(Math.ceil((MAX_MENU_IMAGE_BYTES * 4) / 3) + 4)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Invalid image encoding."),
});

export const getMenuCatalogFn = createServerFn({ method: "GET" })
  .validator(restaurantSchema)
  .handler(async ({ data }) => {
    const { getMenuCatalog } = await import("@/server/menu-management.server");
    return getMenuCatalog(data.restaurantSlug);
  });

export const createMenuItemFn = createServerFn({ method: "POST" })
  .validator(createSchema)
  .handler(async ({ data }) => {
    const { requireAdminAccess } = await import("@/server/admin-auth.server");
    const { createMenuItem } = await import("@/server/menu-management.server");
    requireAdminAccess(data.adminToken);
    const { adminToken: _, ...input } = data;
    return createMenuItem(input);
  });

export const deleteMenuItemFn = createServerFn({ method: "POST" })
  .validator(deleteSchema)
  .handler(async ({ data }) => {
    const { requireAdminAccess } = await import("@/server/admin-auth.server");
    const { removeMenuItem } = await import("@/server/menu-management.server");
    requireAdminAccess(data.adminToken);
    return removeMenuItem(data.restaurantSlug, data.menuItemId);
  });

export const uploadMenuImageFn = createServerFn({ method: "POST" })
  .validator(uploadImageSchema)
  .handler(async ({ data }) => {
    const { requireAdminAccess } = await import("@/server/admin-auth.server");
    const { uploadMenuImage } = await import("@/server/menu-management.server");
    requireAdminAccess(data.adminToken);
    const { adminToken: _, ...input } = data;
    return uploadMenuImage(input);
  });
