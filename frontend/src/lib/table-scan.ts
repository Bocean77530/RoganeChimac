/** null means no explicit scan; an empty string means an invalid, explicit ?table=. */
export function tableCodeFromHref(href: string, origin: string): string | null {
  const url = new URL(href, origin);
  if (!["/order", "/checkout"].includes(url.pathname) || !url.searchParams.has("table"))
    return null;
  return url.searchParams.get("table") ?? "";
}
