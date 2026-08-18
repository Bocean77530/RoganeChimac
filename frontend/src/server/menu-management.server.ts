import "@tanstack/react-start/server-only";

import { createHash } from "node:crypto";
import {
  MAX_MENU_IMAGE_BYTES,
  type CreateMenuItemInput,
  type MenuCatalog,
  type MenuImageContentType,
  type UploadMenuImageInput,
} from "@/domain/menu";
import { withDatabase } from "@/db/client.server";
import {
  deleteMenuItem,
  findMenuImage,
  insertMenuItem,
  loadMenuCatalog,
  upsertMenuItemImage,
} from "@/server/repositories/menu-repository.server";

export async function getMenuCatalog(restaurantSlug: string): Promise<MenuCatalog> {
  const catalog = await withDatabase((db) => loadMenuCatalog(db, restaurantSlug));
  if (!catalog) throw new Error("Restaurant not found.");
  return catalog;
}

export async function createMenuItem(input: CreateMenuItemInput): Promise<MenuCatalog> {
  await withDatabase((db) => insertMenuItem(db, input));
  return getMenuCatalog(input.restaurantSlug);
}

export async function removeMenuItem(
  restaurantSlug: string,
  menuItemId: string,
): Promise<MenuCatalog> {
  const removed = await withDatabase((db) => deleteMenuItem(db, restaurantSlug, menuItemId));
  if (!removed) throw new Error("Menu item not found.");
  return getMenuCatalog(restaurantSlug);
}

export async function uploadMenuImage(input: UploadMenuImageInput): Promise<MenuCatalog> {
  const image = decodeMenuImage(input.contentType, input.base64Data);
  const sha256 = createHash("sha256").update(image).digest("hex");

  await withDatabase((db) =>
    upsertMenuItemImage(db, {
      restaurantSlug: input.restaurantSlug,
      menuItemId: input.menuItemId,
      contentType: input.contentType,
      dataBase64: image.toString("base64"),
      byteSize: image.byteLength,
      sha256,
    }),
  );
  return getMenuCatalog(input.restaurantSlug);
}

export async function getMenuImage(imageId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(imageId)) {
    return undefined;
  }
  return withDatabase((db) => findMenuImage(db, imageId));
}

export function decodeMenuImage(contentType: MenuImageContentType, base64Data: string): Buffer {
  if (base64Data.length % 4 !== 0) throw new Error("Invalid image encoding.");
  const image = Buffer.from(base64Data, "base64");
  if (image.byteLength === 0 || image.byteLength > MAX_MENU_IMAGE_BYTES) {
    throw new Error("The compressed image must be no larger than 700 KB.");
  }
  if (!hasExpectedSignature(contentType, image)) {
    throw new Error("The uploaded file does not match its image type.");
  }
  return image;
}

function hasExpectedSignature(contentType: MenuImageContentType, image: Buffer): boolean {
  if (contentType === "image/jpeg") {
    return image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
  }
  if (contentType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((byte, index) => image[index] === byte);
  }
  return (
    image.length >= 12 &&
    image.toString("ascii", 0, 4) === "RIFF" &&
    image.toString("ascii", 8, 12) === "WEBP"
  );
}
