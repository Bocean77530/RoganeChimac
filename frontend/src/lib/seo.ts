import { restaurant } from "@/lib/restaurant";

const FALLBACK_SITE_URL = "https://roganechimac-production.up.railway.app";

function configuredSiteUrl(): string | undefined {
  if (typeof window !== "undefined") return window.location.origin;
  if (typeof process === "undefined") return undefined;

  return process.env.PUBLIC_SITE_URL ?? process.env.APP_BASE_URL ?? process.env.VITE_SITE_URL;
}

export function siteUrl(): string {
  const configured = configuredSiteUrl();

  try {
    const url = new URL(configured ?? FALLBACK_SITE_URL);
    if (url.hostname.endsWith(".railway.internal")) {
      return FALLBACK_SITE_URL;
    }
    return url.origin;
  } catch {
    return FALLBACK_SITE_URL;
  }
}

export function absoluteUrl(path = "/"): string {
  return new URL(path, `${siteUrl()}/`).toString();
}

type PageSeoInput = {
  title: string;
  description: string;
  path: string;
  imagePath?: string;
  imageAlt?: string;
  robots?: string;
};

export function pageSeoMeta({
  title,
  description,
  path,
  imagePath,
  imageAlt = "Korean food at Rogane Chimac in Dickson, Canberra",
  robots = "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
}: PageSeoInput) {
  const url = absoluteUrl(path);
  const image = imagePath ? absoluteUrl(imagePath) : undefined;

  return [
    { title },
    { name: "description", content: description },
    { name: "robots", content: robots },
    { property: "og:locale", content: "en_AU" },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: restaurant.name },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    ...(image
      ? [
          { property: "og:image", content: image },
          { property: "og:image:alt", content: imageAlt },
        ]
      : []),
    { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    ...(image ? [{ name: "twitter:image", content: image }] : []),
  ];
}

export function canonicalLink(path: string) {
  return [{ rel: "canonical", href: absoluteUrl(path) }];
}

export function restaurantJsonLd(imagePath: string) {
  const openingHoursSpecification = restaurant.hours.flatMap((hours) =>
    hours.periods.map((period) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: `https://schema.org/${hours.day}`,
      opens: period.open,
      closes: period.close,
    })),
  );

  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "@id": `${absoluteUrl("/")}#restaurant`,
    name: restaurant.name,
    description: restaurant.description,
    url: absoluteUrl("/"),
    image: absoluteUrl(imagePath),
    telephone: restaurant.phone,
    priceRange: "$$",
    servesCuisine: ["Korean", "Korean Fried Chicken"],
    address: {
      "@type": "PostalAddress",
      streetAddress: restaurant.address.streetAddress,
      addressLocality: restaurant.address.addressLocality,
      addressRegion: restaurant.address.addressRegion,
      postalCode: restaurant.address.postalCode,
      addressCountry: restaurant.address.addressCountry,
    },
    openingHoursSpecification,
    hasMenu: absoluteUrl("/menu"),
    sameAs: Object.values(restaurant.socials).filter(Boolean),
    potentialAction: {
      "@type": "OrderAction",
      target: absoluteUrl("/order"),
    },
  };
}
