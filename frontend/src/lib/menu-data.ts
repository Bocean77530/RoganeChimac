import bulgogi from "@/assets/dish-bulgogi.jpg";
import bibimbap from "@/assets/dish-bibimbap.jpg";
import kfc from "@/assets/dish-kfc.jpg";
import tteokbokki from "@/assets/dish-tteokbokki.jpg";
import kimchiJjigae from "@/assets/dish-kimchi-jjigae.jpg";
import japchae from "@/assets/dish-japchae.jpg";
import porkbelly from "@/assets/dish-porkbelly.jpg";
import kimchiRice from "@/assets/dish-kimchi-rice.jpg";
import corndog from "@/assets/dish-corndog.jpg";
import pancake from "@/assets/dish-pancake.jpg";
import bingsu from "@/assets/dish-bingsu.jpg";

import {
  catalog,
  categories,
  type CatalogItem,
  type Category,
  type ModifierGroup,
} from "./menu-catalog";

export type DietTag = NonNullable<CatalogItem["diet"]>[number];
export type { Category, ModifierGroup };
export type MenuItem = CatalogItem;
export { categories };

const images: Record<string, string> = {
  bulgogi,
  bibimbap,
  kfc,
  tteokbokki,
  kimchiJjigae,
  japchae,
  porkbelly,
  kimchiRice,
  corndog,
  pancake,
  bingsu,
};
export const menu: MenuItem[] = catalog.map((item) => ({ ...item, image: images[item.image] }));

export const menuByCategory = (): Record<string, MenuItem[]> => {
  const grouped: Record<string, MenuItem[]> = {};
  for (const c of categories) grouped[c.id] = [];
  for (const item of menu) grouped[item.category]?.push(item);
  grouped.popular = menu.filter((m) => m.popular);
  return grouped;
};

export const reviews = [
  {
    name: "Amelia W.",
    rating: 5,
    text: "Best Korean fried chicken in Melbourne. The soy garlic is unreal and delivery was quick.",
  },
  {
    name: "Daniel K.",
    rating: 5,
    text: "Bibimbap was gorgeous — proper crispy rice and everything felt fresh. Will be back.",
  },
  {
    name: "Priya S.",
    rating: 5,
    text: "Ordered the BBQ sharing set for four. Massive portions, spot-on flavour, easy pickup.",
  },
];
