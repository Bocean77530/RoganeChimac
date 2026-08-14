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

export type DietTag = "vegetarian" | "vegan" | "gluten-free" | "contains-nuts" | "seafood";

export type ModifierGroup = {
  id: string;
  name: string;
  required?: boolean;
  min?: number;
  max?: number;
  options: { id: string; name: string; priceDelta?: number }[];
};

export type MenuItem = {
  id: string;
  name: string;
  koreanName?: string;
  description: string;
  price: number; // cents
  image: string;
  category: string;
  diet?: DietTag[];
  spice?: 0 | 1 | 2 | 3; // 0 none, 3 extra spicy
  popular?: boolean;
  chefsPick?: boolean;
  soldOut?: boolean;
  modifiers?: ModifierGroup[];
};

export type Category = { id: string; name: string };

export const categories: Category[] = [
  { id: "popular", name: "Popular" },
  { id: "bbq", name: "Korean BBQ" },
  { id: "rice", name: "Rice Dishes" },
  { id: "noodles", name: "Noodles" },
  { id: "stews", name: "Stews & Soups" },
  { id: "chicken", name: "Korean Fried Chicken" },
  { id: "street", name: "Street Food" },
  { id: "shared", name: "Shared Plates" },
  { id: "veg", name: "Vegetarian" },
  { id: "sides", name: "Side Dishes" },
  { id: "drinks", name: "Drinks" },
  { id: "desserts", name: "Desserts" },
];

const spiceMods: ModifierGroup = {
  id: "spice",
  name: "Spice level",
  required: true,
  options: [
    { id: "mild", name: "Mild" },
    { id: "medium", name: "Medium" },
    { id: "spicy", name: "Spicy" },
    { id: "extra", name: "Extra spicy", priceDelta: 0 },
  ],
};

const addOns: ModifierGroup = {
  id: "addons",
  name: "Add-ons",
  options: [
    { id: "egg", name: "Fried egg", priceDelta: 250 },
    { id: "rice", name: "Steamed rice", priceDelta: 350 },
    { id: "kimchi", name: "Extra kimchi", priceDelta: 300 },
    { id: "sauce", name: "Extra sauce", priceDelta: 150 },
    { id: "cheese", name: "Melted cheese", priceDelta: 300 },
  ],
};

export const menu: MenuItem[] = [
  // BBQ / popular
  { id: "bulgogi", name: "Beef Bulgogi", koreanName: "불고기", description: "Thinly sliced marinated beef with onions, mushrooms and Korean barbecue sauce, served with steamed rice.", price: 2290, image: bulgogi, category: "bbq", popular: true, spice: 1, modifiers: [addOns] },
  { id: "spicy-pork", name: "Spicy Pork Bulgogi", koreanName: "제육볶음", description: "Marinated pork stir-fried with vegetables and spicy gochujang sauce.", price: 2190, image: porkbelly, category: "bbq", spice: 2, modifiers: [spiceMods, addOns] },
  { id: "la-galbi", name: "LA Galbi", koreanName: "LA 갈비", description: "Korean-style marinated beef short ribs with rice and side dishes.", price: 3290, image: bulgogi, category: "bbq", chefsPick: true, modifiers: [addOns] },
  { id: "samgyeopsal", name: "Grilled Pork Belly", koreanName: "삼겹살", description: "Grilled pork belly served with lettuce, garlic, ssamjang and kimchi.", price: 2590, image: porkbelly, category: "bbq", modifiers: [addOns] },

  // Rice
  { id: "bibimbap", name: "Classic Bibimbap", koreanName: "비빔밥", description: "Steamed rice topped with seasonal vegetables, egg, sesame oil and gochujang sauce.", price: 1990, image: bibimbap, category: "rice", popular: true, spice: 1, diet: ["vegetarian"], modifiers: [addOns] },
  { id: "beef-bibimbap", name: "Beef Bibimbap", description: "Bibimbap topped with bulgogi-marinated beef.", price: 2290, image: bibimbap, category: "rice", spice: 1, modifiers: [addOns] },
  { id: "kimchi-rice", name: "Kimchi Fried Rice", koreanName: "김치볶음밥", description: "Fried rice with kimchi, vegetables and a fried egg.", price: 1890, image: kimchiRice, category: "rice", spice: 2, modifiers: [addOns] },
  { id: "kfc-bowl", name: "Korean Fried Chicken Rice Bowl", description: "Crispy chicken over rice with pickles, gochujang mayo and sesame.", price: 2090, image: kfc, category: "rice", spice: 2, modifiers: [addOns] },

  // Noodles
  { id: "japchae", name: "Japchae", koreanName: "잡채", description: "Sweet potato glass noodles stir-fried with vegetables and sesame soy sauce.", price: 1890, image: japchae, category: "noodles", diet: ["vegetarian"], modifiers: [addOns] },
  { id: "jajangmyeon", name: "Jajangmyeon", koreanName: "짜장면", description: "Noodles served with rich black bean sauce, pork and vegetables.", price: 1990, image: japchae, category: "noodles" },
  { id: "jjamppong", name: "Spicy Seafood Noodles", koreanName: "짬뽕", description: "Spicy noodle soup with prawns, squid, mussels and vegetables.", price: 2290, image: japchae, category: "noodles", spice: 3, diet: ["seafood"] },
  { id: "naengmyeon", name: "Korean Cold Noodles", koreanName: "냉면", description: "Chilled buckwheat noodles in tangy iced broth with pear and cucumber.", price: 1990, image: japchae, category: "noodles" },

  // Stews
  { id: "kimchi-jjigae", name: "Kimchi Jjigae", koreanName: "김치찌개", description: "Spicy kimchi stew with pork, tofu and vegetables, served with rice.", price: 2090, image: kimchiJjigae, category: "stews", popular: true, spice: 2 },
  { id: "sundubu", name: "Soft Tofu Stew", koreanName: "순두부찌개", description: "Spicy soft tofu stew with egg and a choice of beef, seafood or mushrooms.", price: 2190, image: kimchiJjigae, category: "stews", spice: 2, modifiers: [{ id: "protein", name: "Protein", required: true, options: [{ id: "beef", name: "Beef" }, { id: "seafood", name: "Seafood", priceDelta: 200 }, { id: "mush", name: "Mushroom" }] }] },
  { id: "doenjang", name: "Soybean Paste Stew", koreanName: "된장찌개", description: "Rustic soybean paste stew with tofu, zucchini and mushrooms.", price: 1990, image: kimchiJjigae, category: "stews", diet: ["vegetarian"] },
  { id: "galbitang", name: "Beef Short Rib Soup", koreanName: "갈비탕", description: "Slow-simmered beef short rib soup with radish and glass noodles.", price: 2490, image: kimchiJjigae, category: "stews" },

  // Chicken
  { id: "kfc", name: "Korean Fried Chicken", koreanName: "양념치킨", description: "Double-fried crispy chicken tossed in our house sauces.", price: 1790, image: kfc, category: "chicken", popular: true, spice: 2,
    modifiers: [
      { id: "portion", name: "Portion", required: true, options: [{ id: "half", name: "Half" }, { id: "full", name: "Full", priceDelta: 1400 }] },
      { id: "bone", name: "Bone", required: true, options: [{ id: "bone-in", name: "Bone-in" }, { id: "boneless", name: "Boneless", priceDelta: 300 }] },
      { id: "flavour", name: "Flavour", required: true, options: [
        { id: "original", name: "Original Crispy" },
        { id: "sweet-spicy", name: "Sweet & Spicy" },
        { id: "soy-garlic", name: "Soy Garlic" },
        { id: "honey", name: "Honey Butter" },
        { id: "extra", name: "Extra Spicy" },
      ] },
      { id: "extras", name: "Extras", options: [
        { id: "extra-sauce", name: "Extra sauce", priceDelta: 150 },
        { id: "radish", name: "Pickled radish", priceDelta: 350 },
        { id: "chips", name: "Korean chips", priceDelta: 690 },
        { id: "rice2", name: "Steamed rice", priceDelta: 350 },
      ] },
    ],
  },

  // Street food
  { id: "tteokbokki", name: "Tteokbokki", koreanName: "떡볶이", description: "Chewy rice cakes and fish cakes cooked in a sweet and spicy gochujang sauce.", price: 1690, image: tteokbokki, category: "street", popular: true, spice: 2 },
  { id: "corn-dog", name: "Korean Corn Dog", koreanName: "핫도그", description: "Crispy panko corn dog with mozzarella and sausage.", price: 890, image: corndog, category: "street" },
  { id: "kimchi-pancake", name: "Kimchi Pancake", koreanName: "김치전", description: "Golden crispy kimchi pancake with dipping sauce.", price: 1690, image: pancake, category: "street", diet: ["vegetarian"], spice: 1 },
  { id: "seafood-pancake", name: "Seafood Pancake", koreanName: "해물파전", description: "Spring onion and seafood pancake, crisp on the outside, tender inside.", price: 2090, image: pancake, category: "street", diet: ["seafood"] },
  { id: "mandu", name: "Mandu Dumplings", koreanName: "만두", description: "Pan-fried dumplings with pork and vegetables.", price: 1290, image: corndog, category: "street" },

  // Shared
  { id: "bossam", name: "Bossam", koreanName: "보쌈", description: "Tender sliced pork served with kimchi, lettuce, garlic and ssamjang.", price: 3490, image: porkbelly, category: "shared", chefsPick: true },
  { id: "budae", name: "Army Stew", koreanName: "부대찌개", description: "Large shared stew with sausage, spam, tofu, kimchi, noodles and vegetables.", price: 3990, image: kimchiJjigae, category: "shared", spice: 2 },
  { id: "bbq-set", name: "Korean BBQ Sharing Set", description: "A combination of bulgogi, spicy pork, fried chicken, rice and side dishes.", price: 6990, image: bulgogi, category: "shared", popular: true },

  // Veg
  { id: "veg-bibimbap", name: "Vegetable Bibimbap", description: "Bibimbap loaded with seasonal vegetables and gochujang.", price: 1890, image: bibimbap, category: "veg", diet: ["vegetarian", "vegan"], spice: 1 },
  { id: "veg-japchae", name: "Vegetable Japchae", description: "Glass noodles with mushrooms and vegetables in sesame soy.", price: 1790, image: japchae, category: "veg", diet: ["vegetarian", "vegan"] },
  { id: "veg-sundubu", name: "Mushroom Soft Tofu Stew", description: "Silken tofu stew with mixed mushrooms.", price: 1990, image: kimchiJjigae, category: "veg", diet: ["vegetarian"], spice: 2 },
  { id: "veg-mandu", name: "Vegetable Mandu", description: "Steamed dumplings filled with tofu and vegetables.", price: 1190, image: corndog, category: "veg", diet: ["vegetarian", "vegan"] },

  // Sides
  { id: "kimchi", name: "Kimchi", description: "House-fermented napa cabbage kimchi.", price: 450, image: tteokbokki, category: "sides", diet: ["vegan"], spice: 2 },
  { id: "rice", name: "Steamed Rice", description: "Short-grain steamed rice.", price: 350, image: kimchiRice, category: "sides", diet: ["vegan", "gluten-free"] },
  { id: "radish", name: "Pickled Radish", description: "Sweet and tangy pickled daikon.", price: 350, image: kimchiRice, category: "sides", diet: ["vegan", "gluten-free"] },
  { id: "seaweed", name: "Seasoned Seaweed", description: "Toasted seaweed with sesame oil.", price: 390, image: kimchiRice, category: "sides", diet: ["vegan"] },
  { id: "chips", name: "Korean Chips", description: "Crispy chips with gochugaru salt.", price: 690, image: corndog, category: "sides", diet: ["vegetarian"] },
  { id: "banchan", name: "Extra Banchan Set", description: "Chef's selection of Korean side dishes.", price: 890, image: kimchiRice, category: "sides", diet: ["vegetarian"] },

  // Drinks
  { id: "pear", name: "Korean Pear Juice", description: "Chilled Korean pear juice.", price: 490, image: bingsu, category: "drinks", diet: ["vegan", "gluten-free"] },
  { id: "grape", name: "Korean Grape Juice", description: "Sweet chilled grape juice.", price: 490, image: bingsu, category: "drinks", diet: ["vegan", "gluten-free"] },
  { id: "milkis", name: "Milkis", description: "Milky sparkling soda.", price: 450, image: bingsu, category: "drinks", diet: ["vegetarian"] },
  { id: "soft", name: "Soft Drink", description: "Coke, Sprite or Fanta.", price: 400, image: bingsu, category: "drinks" },
  { id: "sparkling", name: "Sparkling Water", description: "Chilled sparkling mineral water.", price: 450, image: bingsu, category: "drinks", diet: ["vegan", "gluten-free"] },
  { id: "barley", name: "Iced Korean Barley Tea", description: "Cold-brewed roasted barley tea.", price: 550, image: bingsu, category: "drinks", diet: ["vegan"] },

  // Desserts
  { id: "hotteok", name: "Hotteok", koreanName: "호떡", description: "Korean sweet pancake filled with brown sugar and cinnamon.", price: 990, image: bingsu, category: "desserts", diet: ["vegetarian"] },
  { id: "bingsu", name: "Bingsu", koreanName: "빙수", description: "Shaved milk ice with red bean, mochi and condensed milk.", price: 1490, image: bingsu, category: "desserts", diet: ["vegetarian"] },
  { id: "rice-cake", name: "Korean Rice Cake Selection", description: "Assorted sweet rice cakes.", price: 1090, image: bingsu, category: "desserts", diet: ["vegetarian"] },
];

export const menuByCategory = (): Record<string, MenuItem[]> => {
  const grouped: Record<string, MenuItem[]> = {};
  for (const c of categories) grouped[c.id] = [];
  for (const item of menu) grouped[item.category]?.push(item);
  grouped.popular = menu.filter((m) => m.popular);
  return grouped;
};

export const reviews = [
  { name: "Amelia W.", rating: 5, text: "Best Korean fried chicken in Melbourne. The soy garlic is unreal and delivery was quick." },
  { name: "Daniel K.", rating: 5, text: "Bibimbap was gorgeous — proper crispy rice and everything felt fresh. Will be back." },
  { name: "Priya S.", rating: 5, text: "Ordered the BBQ sharing set for four. Massive portions, spot-on flavour, easy pickup." },
];
