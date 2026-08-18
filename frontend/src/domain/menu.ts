export const dietTags = ["vegetarian", "vegan", "gluten-free", "contains-nuts", "seafood"] as const;

export type DietTag = (typeof dietTags)[number];

export type MenuModifierOptionView = {
  id: string;
  name: string;
  priceDeltaCents: number;
};

export type MenuModifierGroupView = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: MenuModifierOptionView[];
};

export type MenuCategoryView = {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
};

export type MenuItemView = {
  id: string;
  slug: string;
  name: string;
  koreanName: string | null;
  description: string;
  imageKey: string;
  priceCents: number;
  categoryId: string;
  categorySlug: string;
  soldOut: boolean;
  popular: boolean;
  chefsPick: boolean;
  dietTags: DietTag[];
  spiceLevel: 0 | 1 | 2 | 3;
  sortOrder: number;
  modifiers: MenuModifierGroupView[];
};

export type MenuCatalog = {
  categories: MenuCategoryView[];
  items: MenuItemView[];
};

export type CreateMenuItemInput = {
  restaurantSlug: string;
  categoryId: string;
  name: string;
  koreanName?: string;
  description: string;
  priceCents: number;
  imageKey: string;
  dietTags: DietTag[];
  spiceLevel: 0 | 1 | 2 | 3;
  popular: boolean;
  chefsPick: boolean;
  soldOut: boolean;
};

export const menuImageContentTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export type MenuImageContentType = (typeof menuImageContentTypes)[number];

export const MAX_MENU_IMAGE_BYTES = 700_000;

export type UploadMenuImageInput = {
  restaurantSlug: string;
  menuItemId: string;
  contentType: MenuImageContentType;
  base64Data: string;
};
