// Central restaurant configuration. Edit here to change branding & business info.
export const restaurant = {
  name: "Seoul Table",
  tagline: "Bold Korean Flavours, Made Fresh",
  description:
    "Classic Korean comfort food, sizzling barbecue, crispy fried chicken and street-food favourites, prepared fresh for pickup or delivery.",
  address: {
    line1: "Shop 4, 128 Little Collins Street",
    suburb: "Melbourne VIC 3000",
    country: "Australia",
  },
  phone: "(03) 9000 1234",
  email: "hello@seoultable.com.au",
  abn: "12 345 678 910",
  socials: {
    instagram: "https://instagram.com/seoultable",
    facebook: "https://facebook.com/seoultable",
  },
  hours: [
    { day: "Monday", open: "11:30", close: "21:30" },
    { day: "Tuesday", open: "11:30", close: "21:30" },
    { day: "Wednesday", open: "11:30", close: "21:30" },
    { day: "Thursday", open: "11:30", close: "22:00" },
    { day: "Friday", open: "11:30", close: "22:30" },
    { day: "Saturday", open: "12:00", close: "22:30" },
    { day: "Sunday", open: "12:00", close: "21:00" },
  ],
  ordering: {
    pickupPrepMinutes: 20,
    deliveryEtaMinutes: 45,
    deliveryFee: 690, // cents
    deliveryMinimum: 2500, // cents
    deliveryRadiusKm: 6,
  },
} as const;

export function isOpenNow(now = new Date()): boolean {
  const day = restaurant.hours[(now.getDay() + 6) % 7]; // Mon-first
  const [oh, om] = day.open.split(":").map(Number);
  const [ch, cm] = day.close.split(":").map(Number);
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins >= oh * 60 + om && mins <= ch * 60 + cm;
}

export const formatAUD = (cents: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);
