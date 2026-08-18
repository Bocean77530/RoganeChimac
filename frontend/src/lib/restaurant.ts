// Central restaurant configuration. Edit here to change branding & business info.
export const restaurant = {
  slug: "rogane-chimac",
  name: "Rogane Chimac",
  tagline: "Korean favourites in the heart of Dickson",
  description:
    "A Korean restaurant in Dickson serving Korean fried chicken, bibimbap, noodles, hot pots and Korean comfort food for lunch, dinner and pickup.",
  address: {
    line1: "Dickson Plaza, Shop 5/28 Challis Street, Woolley Street",
    suburb: "Dickson ACT 2602",
    country: "Australia",
    streetAddress: "Dickson Plaza, Shop 5/28 Challis Street, Woolley Street",
    addressLocality: "Dickson",
    addressRegion: "ACT",
    postalCode: "2602",
    addressCountry: "AU",
  },
  phone: "+61 2 6262 9219",
  email: null,
  abn: null,
  socials: {
    instagram: null,
    facebook: "https://m.facebook.com/roganechimac/",
  },
  timezone: "Australia/Sydney",
  hours: [
    {
      day: "Monday",
      periods: [
        { open: "11:00", close: "14:00" },
        { open: "16:30", close: "20:30" },
      ],
    },
    {
      day: "Tuesday",
      periods: [
        { open: "11:00", close: "14:00" },
        { open: "16:30", close: "20:30" },
      ],
    },
    {
      day: "Wednesday",
      periods: [
        { open: "11:00", close: "14:00" },
        { open: "16:30", close: "20:30" },
      ],
    },
    {
      day: "Thursday",
      periods: [
        { open: "11:00", close: "14:00" },
        { open: "16:30", close: "20:30" },
      ],
    },
    {
      day: "Friday",
      periods: [
        { open: "11:00", close: "14:00" },
        { open: "16:30", close: "20:30" },
      ],
    },
    {
      day: "Saturday",
      periods: [
        { open: "11:00", close: "14:00" },
        { open: "16:30", close: "20:30" },
      ],
    },
    { day: "Sunday", periods: [] },
  ],
  ordering: {
    pickupPrepMinutes: 20,
  },
} as const;

export function isOpenNow(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: restaurant.timezone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const day = restaurant.hours.find((hours) => hours.day === weekday);
  if (!day) return false;
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const mins = hour * 60 + minute;
  return day.periods.some((period) => {
    const [oh, om] = period.open.split(":").map(Number);
    const [ch, cm] = period.close.split(":").map(Number);
    return mins >= oh * 60 + om && mins <= ch * 60 + cm;
  });
}

export function formatRestaurantHours(
  periods: ReadonlyArray<{ open: string; close: string }>,
): string {
  if (periods.length === 0) return "Closed";
  return periods.map((period) => `${period.open}–${period.close}`).join(", ");
}

export const formatAUD = (cents: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);
