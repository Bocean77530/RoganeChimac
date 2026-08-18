import bibimbap from "@/assets/dish-bibimbap.jpg";
import bingsu from "@/assets/dish-bingsu.jpg";
import bulgogi from "@/assets/dish-bulgogi.jpg";
import corndog from "@/assets/dish-corndog.jpg";
import japchae from "@/assets/dish-japchae.jpg";
import kfc from "@/assets/dish-kfc.jpg";
import kimchiJjigae from "@/assets/dish-kimchi-jjigae.jpg";
import kimchiRice from "@/assets/dish-kimchi-rice.jpg";
import pancake from "@/assets/dish-pancake.jpg";
import porkbelly from "@/assets/dish-porkbelly.jpg";
import tteokbokki from "@/assets/dish-tteokbokki.jpg";
import type { DietTag } from "@/domain/menu";

export type { DietTag } from "@/domain/menu";

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
  price: number;
  image: string;
  category: string;
  diet?: DietTag[];
  spice?: 0 | 1 | 2 | 3;
  popular?: boolean;
  chefsPick?: boolean;
  soldOut?: boolean;
  modifiers?: ModifierGroup[];
};

export type Category = { id: string; name: string };

export const categories: Category[] = [
  { id: "popular", name: "Popular" },
  { id: "fried-chicken", name: "Fried Chicken" },
  { id: "hot-pot", name: "Jeon Gol (Hot Pot)" },
  { id: "bibimbap", name: "Bibimbap" },
  { id: "noodles", name: "Noodles" },
  { id: "korean-chinese-noodles", name: "Korean Chinese Noodles" },
  { id: "soups", name: "Soups" },
  { id: "dumpling-soup", name: "Dumpling Soup" },
  { id: "soup-rice", name: "Soup & Rice" },
  { id: "sizzling", name: "Sizzling Dishes" },
  { id: "side-dishes", name: "Side Dishes" },
  { id: "small-sides", name: "Additional Small Sides" },
  { id: "tteokbokki", name: "Rogane Tteokbokki" },
  { id: "pancakes", name: "Jeon / Pancakes" },
];

const chickenPortion = (fullPriceDelta: number): ModifierGroup => ({
  id: "portion",
  name: "Portion",
  required: true,
  max: 1,
  options: [
    { id: "half", name: "Half" },
    { id: "full", name: "Full", priceDelta: fullPriceDelta },
  ],
});

const extraChickenSauce: ModifierGroup = {
  id: "extra-sauce",
  name: "Extra dipping sauce",
  max: 5,
  options: [
    { id: "mayo", name: "Home-made mayo", priceDelta: 300 },
    { id: "sweet-spicy", name: "Sweet & spicy", priceDelta: 300 },
    { id: "chilli", name: "Chilli", priceDelta: 300 },
    { id: "snowing-cheese", name: "Snowing cheese", priceDelta: 300 },
    { id: "sweet-soy", name: "Sweet soy", priceDelta: 300 },
  ],
};

const bonelessFlavour: ModifierGroup = {
  id: "flavour",
  name: "Flavour",
  required: true,
  max: 1,
  options: [
    { id: "plain", name: "Plain" },
    { id: "sweet-spicy", name: "Sweet & spicy" },
    { id: "sweet-soy", name: "Sweet soy" },
    { id: "spicy-soy", name: "Spicy soy — very hot" },
    { id: "chilli-0", name: "Chilli — level 0" },
    { id: "chilli-1", name: "Chilli — level 1" },
    { id: "chilli-2", name: "Chilli — level 2" },
    { id: "chilli-3", name: "Chilli — level 3" },
    { id: "chilli-4", name: "Chilli — level 4" },
    { id: "chilli-5", name: "Chilli — level 5" },
    { id: "snowing-cheese", name: "Snowing cheese" },
    { id: "sweet-sour", name: "Sweet sour" },
  ],
};

const hotPotExtras: ModifierGroup = {
  id: "extra-toppings",
  name: "Extra toppings",
  max: 6,
  options: [
    { id: "rice-cake", name: "Rice cake", priceDelta: 400 },
    { id: "ramyeon", name: "Ramyeon noodle", priceDelta: 300 },
    { id: "sweet-potato-noodle", name: "Sweet potato noodle", priceDelta: 400 },
    { id: "korean-chinese-noodle", name: "Korean Chinese noodle", priceDelta: 400 },
    { id: "cheese", name: "Cheese", priceDelta: 400 },
    { id: "tofu", name: "Tofu", priceDelta: 300 },
  ],
};

const noodleProtein: ModifierGroup = {
  id: "protein",
  name: "Choose one",
  required: true,
  max: 1,
  options: [
    { id: "vegetable", name: "Vegetable" },
    { id: "beef", name: "Beef" },
    { id: "pork", name: "Pork" },
  ],
};

const extraNoodle: ModifierGroup = {
  id: "extra-noodle",
  name: "Extra",
  max: 1,
  options: [{ id: "extra-noodle", name: "Extra noodle", priceDelta: 400 }],
};

const extraMeat: ModifierGroup = {
  id: "extra-meat",
  name: "Extra",
  max: 1,
  options: [{ id: "extra-meat", name: "Extra meat", priceDelta: 600 }],
};

const tteokbokkiSauce: ModifierGroup = {
  id: "sauce",
  name: "Sauce",
  required: true,
  max: 1,
  options: [
    { id: "original", name: "Original gochujang" },
    { id: "sweet-soy", name: "Sweet soy" },
    { id: "chilli-0", name: "Chilli — level 0" },
    { id: "chilli-1", name: "Chilli — level 1" },
    { id: "chilli-2", name: "Chilli — level 2" },
    { id: "chilli-3", name: "Chilli — level 3" },
    { id: "chilli-4", name: "Chilli — level 4" },
    { id: "chilli-5", name: "Chilli — level 5" },
  ],
};

export const menu: MenuItem[] = [
  {
    id: "crispy-chicken-wings",
    name: "Crispy Chicken Wings",
    description:
      "Bone-in wings coated in Korean-style batter, served with home-made mustard and pickled radish. Full size includes a can of soft drink.",
    price: 2500,
    image: kfc,
    category: "fried-chicken",
    popular: true,
    modifiers: [chickenPortion(1500), extraChickenSauce],
  },
  {
    id: "boneless-fried-chicken",
    name: "Boneless Fried Chicken",
    description:
      "Crispy boneless chicken pieces coated in Korean-style batter, served with home-made mayo and pickled radish. Full size includes a can of soft drink.",
    price: 2700,
    image: kfc,
    category: "fried-chicken",
    popular: true,
    chefsPick: true,
    modifiers: [chickenPortion(1500), bonelessFlavour, extraChickenSauce],
  },
  {
    id: "bu-dae-jeon-gol",
    name: "Bu Dae Jeon Gol",
    koreanName: "부대전골",
    description:
      "Spicy pork broth with kimchi, sausage, ham, ramyeon, baked beans, rice cake and vegetables. Serves 3 with three side dishes.",
    price: 6000,
    image: kimchiJjigae,
    category: "hot-pot",
    spice: 2,
    popular: true,
    modifiers: [hotPotExtras],
  },
  {
    id: "gam-ja-jeon-gol",
    name: "Gam Ja Jeon Gol",
    koreanName: "감자전골",
    description:
      "Slow-cooked spicy pork-bone broth with potato, sweet potato noodles, perilla leaf and perilla seed powder. Serves 3 with three side dishes.",
    price: 6000,
    image: kimchiJjigae,
    category: "hot-pot",
    spice: 2,
    modifiers: [hotPotExtras],
  },
  {
    id: "man-du-jeon-gol",
    name: "Man Du Jeon Gol",
    koreanName: "만두전골",
    description:
      "Spicy pork broth with marinated beef, six seafood dumplings, tofu, vegetables and sweet potato noodles. Serves 3 with three side dishes.",
    price: 6000,
    image: kimchiJjigae,
    category: "hot-pot",
    spice: 2,
    diet: ["seafood"],
    modifiers: [hotPotExtras],
  },
  {
    id: "jjam-ppong-jeon-gol",
    name: "Jjam Ppong Jeon Gol",
    koreanName: "짬뽕전골",
    description:
      "Spicy seafood broth with crab, prawn, mussel, squid, bean sprouts, vegetables and Korean Chinese noodles. Serves 3 with three side dishes.",
    price: 6600,
    image: kimchiJjigae,
    category: "hot-pot",
    spice: 2,
    diet: ["seafood"],
    modifiers: [hotPotExtras],
  },
  {
    id: "vegetable-bibimbap",
    name: "Vegetable Bibimbap",
    koreanName: "야채비빔밥",
    description:
      "Warm rice with egg and vegetables, served with chilli paste, miso soup and three side dishes.",
    price: 2100,
    image: bibimbap,
    category: "bibimbap",
    diet: ["vegetarian"],
  },
  {
    id: "beef-bibimbap",
    name: "Beef Bibimbap",
    koreanName: "소고기비빔밥",
    description: "Soy-marinated beef bibimbap, served with miso soup and three side dishes.",
    price: 2300,
    image: bibimbap,
    category: "bibimbap",
    popular: true,
  },
  {
    id: "pork-bibimbap",
    name: "Pork Bibimbap",
    koreanName: "돼지고기비빔밥",
    description: "Chilli-marinated pork bibimbap, served with miso soup and three side dishes.",
    price: 2300,
    image: bibimbap,
    category: "bibimbap",
    spice: 2,
  },
  {
    id: "kimchi-cheese-bibimbap",
    name: "Kimchi Cheese Bibimbap",
    koreanName: "김치치즈비빔밥",
    description:
      "Rice in a sizzling bowl topped with cooked kimchi, vegetables, mozzarella cheese and bacon pieces.",
    price: 2300,
    image: bibimbap,
    category: "bibimbap",
    spice: 1,
  },
  {
    id: "jabchae",
    name: "Jabchae",
    koreanName: "잡채",
    description: "Sweet potato noodles stir-fried with vegetables in sweet soy sauce.",
    price: 2300,
    image: japchae,
    category: "noodles",
    modifiers: [noodleProtein],
  },
  {
    id: "bul-jabchae",
    name: "Bul Jabchae",
    koreanName: "불잡채",
    description: "Sweet potato noodles stir-fried with vegetables in a very hot chilli sauce.",
    price: 2400,
    image: japchae,
    category: "noodles",
    spice: 3,
    modifiers: [noodleProtein],
  },
  {
    id: "jja-jang-myeon",
    name: "Jja Jang Myeon",
    koreanName: "짜장면",
    description:
      "Noodles with a thick black bean sauce made with pork, onion, cabbage, carrot and zucchini.",
    price: 2200,
    image: japchae,
    category: "korean-chinese-noodles",
    modifiers: [extraNoodle],
  },
  {
    id: "bul-jjam-ppong-myeon",
    name: "Bul Jjam Ppong Myeon",
    koreanName: "불짬뽕면",
    description:
      "Korean Chinese noodles in very spicy chicken broth with squid, mussel, prawn, pork and vegetables.",
    price: 2500,
    image: japchae,
    category: "korean-chinese-noodles",
    spice: 3,
    diet: ["seafood"],
    modifiers: [extraNoodle],
  },
  {
    id: "crab-jjam-ppong-myeon",
    name: "Crab Jjam Ppong Myeon",
    koreanName: "꽃게짬뽕면",
    description:
      "Korean Chinese noodles in spicy seafood broth with crab, squid, mussel, prawn, bean sprouts and vegetables.",
    price: 2800,
    image: japchae,
    category: "korean-chinese-noodles",
    spice: 2,
    diet: ["seafood"],
    modifiers: [extraNoodle],
  },
  {
    id: "bu-dae-jji-gae",
    name: "Bu Dae Jji Gae",
    koreanName: "부대찌개",
    description:
      "Spicy pork, sausage and ham soup with kimchi, baked beans, vegetables and ramyeon in a small hot pot.",
    price: 2300,
    image: kimchiJjigae,
    category: "soups",
    spice: 2,
  },
  {
    id: "haemul-soon-du-bu",
    name: "Haemul Soon Du Bu",
    koreanName: "해물순두부",
    description:
      "Silken tofu soup with seafood, vegetables and egg in a small hot pot. Clear soup is available.",
    price: 2400,
    image: kimchiJjigae,
    category: "soups",
    spice: 2,
    diet: ["seafood"],
  },
  {
    id: "ban-baek-suk",
    name: "Ban Baek Suk",
    koreanName: "반백숙",
    description:
      "Clear half-chicken soup with garlic, scallion, Korean herbs, sweet potato noodles, onion, chive and shallot.",
    price: 2400,
    image: kimchiJjigae,
    category: "soups",
  },
  {
    id: "mal-geun-dak-gae-man-du-guk",
    name: "Mal Geun Dak Gae Man Du Guk",
    koreanName: "맑은닭개만두국",
    description:
      "Clear chicken soup with three seafood-stuffed dumplings, vegetables and beaten egg.",
    price: 2500,
    image: kimchiJjigae,
    category: "dumpling-soup",
    diet: ["seafood"],
  },
  {
    id: "dak-gae-man-du-guk",
    name: "Dak Gae Man Du Guk",
    koreanName: "닭개만두국",
    description:
      "Spicy chicken soup with three seafood-stuffed dumplings, vegetables and beaten egg.",
    price: 2500,
    image: kimchiJjigae,
    category: "dumpling-soup",
    spice: 2,
    diet: ["seafood"],
  },
  {
    id: "yachae-soon-du-bu",
    name: "Yachae Soon Du Bu",
    koreanName: "야채순두부",
    description:
      "Silken tofu soup with vegetables and egg. Clear soup is available. Served with rice and three side dishes.",
    price: 2200,
    image: kimchiJjigae,
    category: "soup-rice",
    spice: 2,
    diet: ["vegetarian"],
  },
  {
    id: "yuk-gae-jang",
    name: "Yuk Gae Jang",
    koreanName: "육개장",
    description:
      "Spicy beef soup with Korean herbs, vegetables and beaten egg. Served with rice and three side dishes.",
    price: 2300,
    image: kimchiJjigae,
    category: "soup-rice",
    spice: 2,
  },
  {
    id: "beoseot-ttuk-bulgogi",
    name: "Beoseot Ttuk Bulgogi",
    koreanName: "버섯뚝불고기",
    description:
      "Sweet soy beef bulgogi soup with assorted mushrooms, vegetables and sweet potato noodles. Served with rice and three side dishes.",
    price: 2500,
    image: bulgogi,
    category: "soup-rice",
  },
  {
    id: "dwae-ji-guk-bap",
    name: "Dwae Ji Guk Bap",
    koreanName: "돼지국밥",
    description:
      "Clear pork soup with pork shoulder and intestine, sweet potato noodles, chive and shallot. Served with rice and chilli paste.",
    price: 2300,
    image: kimchiJjigae,
    category: "soup-rice",
  },
  {
    id: "ppyeo-hae-jang-guk",
    name: "Ppyeo Hae Jang Guk",
    koreanName: "뼈해장국",
    description:
      "Spicy pork-bone soup with sweet potato noodles, sliced perilla leaf and perilla seed powder. Served with rice and three side dishes.",
    price: 2500,
    image: kimchiJjigae,
    category: "soup-rice",
    spice: 2,
  },
  {
    id: "kim-chi-jji-gae",
    name: "Kim Chi Jji Gae",
    koreanName: "김치찌개",
    description:
      "Spicy and sour kimchi soup with pork, tofu, onion and shallot. Served with rice and three side dishes.",
    price: 2300,
    image: kimchiJjigae,
    category: "soup-rice",
    spice: 2,
    popular: true,
  },
  {
    id: "sizzling-beef-bulgogi",
    name: "Beef Bulgogi",
    koreanName: "소불고기",
    description: "Sliced beef, soy sauce and vegetables, served sizzling with three side dishes.",
    price: 2400,
    image: bulgogi,
    category: "sizzling",
    popular: true,
  },
  {
    id: "sizzling-pork-bulgogi",
    name: "Pork Bulgogi",
    koreanName: "돼지불고기",
    description:
      "Sliced pork, chilli sauce and vegetables, served sizzling with three side dishes.",
    price: 2400,
    image: porkbelly,
    category: "sizzling",
    spice: 2,
  },
  {
    id: "sizzling-squid",
    name: "Squid",
    koreanName: "오징어볶음",
    description:
      "Sliced squid, chilli sauce and vegetables, served sizzling with three side dishes.",
    price: 2500,
    image: porkbelly,
    category: "sizzling",
    spice: 2,
    diet: ["seafood"],
  },
  {
    id: "sizzling-squid-pork",
    name: "Squid and Pork",
    koreanName: "오삼불고기",
    description:
      "Squid and pork with chilli sauce and vegetables, served sizzling with three side dishes.",
    price: 2600,
    image: porkbelly,
    category: "sizzling",
    spice: 2,
    diet: ["seafood"],
  },
  {
    id: "jok-bal",
    name: "Jok Bal",
    koreanName: "족발",
    description:
      "Sliced pork hock braised in the chef's soy sauce, ginger and spices, served with shallot salad and three side dishes.",
    price: 3500,
    image: porkbelly,
    category: "sizzling",
    modifiers: [extraMeat],
  },
  {
    id: "bo-ssam",
    name: "Bo Ssam",
    koreanName: "보쌈",
    description:
      "Sliced pork belly braised in the chef's soy sauce and spices, served with shallot salad and three side dishes.",
    price: 3500,
    image: porkbelly,
    category: "sizzling",
    chefsPick: true,
    modifiers: [extraMeat],
  },
  {
    id: "vegetable-dumplings",
    name: "Vegetable Dumplings",
    description: "Five vegetable dumplings.",
    price: 1200,
    image: corndog,
    category: "side-dishes",
    diet: ["vegetarian"],
  },
  {
    id: "kimmali",
    name: "Kimmali",
    koreanName: "김말이",
    description: "Five deep-fried seaweed rolls.",
    price: 1200,
    image: corndog,
    category: "side-dishes",
    diet: ["vegetarian"],
  },
  {
    id: "deep-fried-prawn",
    name: "Deep Fried Prawn",
    description: "Four deep-fried prawns.",
    price: 1300,
    image: corndog,
    category: "side-dishes",
    diet: ["seafood"],
  },
  {
    id: "deep-fried-dubu",
    name: "Deep Fried Dubu",
    koreanName: "두부튀김",
    description: "Crispy deep-fried tofu.",
    price: 1500,
    image: corndog,
    category: "side-dishes",
    diet: ["vegetarian"],
  },
  {
    id: "dubu-kimchi",
    name: "Dubu Kimchi",
    koreanName: "두부김치",
    description: "Tofu served with stir-fried kimchi.",
    price: 1800,
    image: kimchiRice,
    category: "side-dishes",
    spice: 1,
    modifiers: [
      {
        id: "extra-pork-belly",
        name: "Extra",
        max: 1,
        options: [{ id: "extra-pork-belly", name: "Extra pork belly", priceDelta: 600 }],
      },
    ],
  },
  {
    id: "bowl-of-rice",
    name: "Bowl of Rice",
    description: "Steamed short-grain rice.",
    price: 300,
    image: kimchiRice,
    category: "small-sides",
    diet: ["vegan", "gluten-free"],
  },
  {
    id: "side-miso",
    name: "Side Miso",
    description: "A small serving of miso soup.",
    price: 300,
    image: kimchiJjigae,
    category: "small-sides",
    diet: ["vegetarian"],
  },
  {
    id: "shallot-salad",
    name: "Shallot Salad",
    description: "Fresh shallot salad.",
    price: 500,
    image: kimchiRice,
    category: "small-sides",
    diet: ["vegetarian"],
  },
  {
    id: "shallot-salad-dressing",
    name: "Shallot Salad and Dressing",
    description: "Fresh shallot salad with house dressing.",
    price: 700,
    image: kimchiRice,
    category: "small-sides",
    diet: ["vegetarian"],
  },
  {
    id: "kimchi-side",
    name: "Kimchi",
    description: "A side serving of kimchi.",
    price: 400,
    image: kimchiRice,
    category: "small-sides",
    spice: 1,
  },
  {
    id: "fish-cakes-side",
    name: "Fish Cakes",
    description: "A side serving of Korean fish cakes.",
    price: 400,
    image: kimchiRice,
    category: "small-sides",
    diet: ["seafood"],
  },
  {
    id: "creamy-pasta-side",
    name: "Creamy Pasta",
    description: "A small serving of creamy pasta.",
    price: 400,
    image: kimchiRice,
    category: "small-sides",
    diet: ["vegetarian"],
  },
  {
    id: "spicy-yellow-radish",
    name: "Spicy Yellow Radish",
    description: "A side serving of spicy yellow radish.",
    price: 400,
    image: kimchiRice,
    category: "small-sides",
    spice: 1,
    diet: ["vegan"],
  },
  {
    id: "mini-banchan-set",
    name: "Mini Banchan Set",
    description: "A small selection of Korean side dishes.",
    price: 400,
    image: kimchiRice,
    category: "small-sides",
  },
  {
    id: "white-pickles",
    name: "White Pickles",
    description: "A side serving of house white pickles.",
    price: 400,
    image: kimchiRice,
    category: "small-sides",
    diet: ["vegan", "gluten-free"],
  },
  {
    id: "cabbage-salad",
    name: "Cabbage Salad",
    description: "Fresh cabbage salad.",
    price: 400,
    image: kimchiRice,
    category: "small-sides",
    diet: ["vegetarian"],
  },
  {
    id: "chips",
    name: "Chips",
    description: "Crispy hot chips.",
    price: 900,
    image: corndog,
    category: "small-sides",
    diet: ["vegetarian"],
  },
  {
    id: "snowing-chips",
    name: "Snowing Chips",
    description: "Hot chips topped with snowing cheese seasoning.",
    price: 1200,
    image: corndog,
    category: "small-sides",
    diet: ["vegetarian"],
  },
  {
    id: "cheesy-corn",
    name: "Cheesy Corn",
    description: "Sweet corn baked with melted cheese.",
    price: 1500,
    image: corndog,
    category: "small-sides",
    diet: ["vegetarian"],
  },
  {
    id: "rogane-tteokbokki",
    name: "Rogane Tteokbokki",
    koreanName: "로가네 떡볶이",
    description: "Chewy Korean rice cakes with your choice of Rogane sauce.",
    price: 1600,
    image: tteokbokki,
    category: "tteokbokki",
    spice: 2,
    popular: true,
    modifiers: [
      tteokbokkiSauce,
      {
        id: "extra-cheese",
        name: "Extra",
        max: 1,
        options: [{ id: "extra-cheese", name: "Extra cheese", priceDelta: 400 }],
      },
    ],
  },
  {
    id: "kimchi-pancake",
    name: "Kimchi Pancake",
    koreanName: "김치전",
    description: "Crispy Korean pancake with kimchi.",
    price: 2300,
    image: pancake,
    category: "pancakes",
    spice: 1,
  },
  {
    id: "vegetable-shallot-pancake",
    name: "Vegetables & Shallot Pancake",
    koreanName: "야채파전",
    description: "Crispy Korean pancake with vegetables and shallot.",
    price: 2200,
    image: pancake,
    category: "pancakes",
    diet: ["vegetarian"],
  },
  {
    id: "seafood-shallot-pancake",
    name: "Seafood & Shallot Pancake",
    koreanName: "해물파전",
    description: "Crispy Korean pancake with seafood and shallot.",
    price: 2400,
    image: pancake,
    category: "pancakes",
    diet: ["seafood"],
    popular: true,
  },
];

export const menuByCategory = (): Record<string, MenuItem[]> => {
  const grouped: Record<string, MenuItem[]> = {};
  for (const category of categories) grouped[category.id] = [];
  for (const item of menu) grouped[item.category]?.push(item);
  grouped.popular = menu.filter((item) => item.popular);
  return grouped;
};

export const menuImageOptions = [
  { key: "bulgogi", label: "Korean barbecue", image: bulgogi },
  { key: "bibimbap", label: "Rice bowl", image: bibimbap },
  { key: "kfc", label: "Fried chicken", image: kfc },
  { key: "tteokbokki", label: "Tteokbokki", image: tteokbokki },
  { key: "kimchi-jjigae", label: "Stew", image: kimchiJjigae },
  { key: "japchae", label: "Noodles", image: japchae },
  { key: "samgyeopsal", label: "Pork belly", image: porkbelly },
  { key: "kimchi-rice", label: "Rice and sides", image: kimchiRice },
  { key: "corn-dog", label: "Fried sides", image: corndog },
  { key: "kimchi-pancake", label: "Pancake", image: pancake },
  { key: "bingsu", label: "Drinks and desserts", image: bingsu },
];

const menuImages = new Map(menuImageOptions.map((option) => [option.key, option.image]));

export function imageForMenuKey(imageKey: string): string {
  const uploaded = imageKey.match(
    /^uploaded:([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):([0-9a-f]{64})$/i,
  );
  if (uploaded) return `/api/menu-images/${uploaded[1]}?v=${uploaded[2]?.slice(0, 12)}`;
  return menu.find((item) => item.id === imageKey)?.image ?? menuImages.get(imageKey) ?? kfc;
}
