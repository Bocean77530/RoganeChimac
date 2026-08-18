import { Link } from "@tanstack/react-router";
import { Instagram, Facebook } from "lucide-react";
import { formatRestaurantHours, restaurant } from "@/lib/restaurant";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border bg-card/40">
      <div className="container-page grid gap-10 py-14 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground font-display font-bold">
              R
            </span>
            <span className="font-display text-lg font-bold">{restaurant.name}</span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground max-w-xs">{restaurant.description}</p>
          <div className="mt-4 flex gap-2">
            {restaurant.socials.instagram && (
              <a
                href={restaurant.socials.instagram}
                aria-label="Instagram"
                className="grid h-10 w-10 place-items-center rounded-full border border-border hover:bg-accent"
              >
                <Instagram className="h-4 w-4" />
              </a>
            )}
            {restaurant.socials.facebook && (
              <a
                href={restaurant.socials.facebook}
                aria-label="Facebook"
                className="grid h-10 w-10 place-items-center rounded-full border border-border hover:bg-accent"
              >
                <Facebook className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>

        <div>
          <h3 className="font-display font-bold">Visit</h3>
          <address className="mt-3 not-italic text-sm text-muted-foreground leading-relaxed">
            {restaurant.address.line1}
            <br />
            {restaurant.address.suburb}
            <br />
            {restaurant.phone}
            {restaurant.email && (
              <>
                <br />
                {restaurant.email}
              </>
            )}
          </address>
        </div>

        <div>
          <h3 className="font-display font-bold">Hours</h3>
          <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
            {restaurant.hours.map((h) => (
              <li key={h.day} className="flex justify-between gap-4">
                <span>{h.day}</span>
                <span>{formatRestaurantHours(h.periods)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="font-display font-bold">More</h3>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link to="/order" className="hover:text-primary">
                Order Online
              </Link>
            </li>
            <li>
              <Link to="/menu" className="hover:text-primary">
                Menu
              </Link>
            </li>
            <li>
              <Link to="/korean-fried-chicken-dickson" className="hover:text-primary">
                Korean Fried Chicken
              </Link>
            </li>
            <li>
              <Link to="/privacy" className="hover:text-primary">
                Privacy
              </Link>
            </li>
            <li>
              <Link to="/terms" className="hover:text-primary">
                Terms
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="container-page py-6 text-xs text-muted-foreground flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
          <p className="max-w-2xl">
            Allergen notice: please inform our team of any allergies before ordering. While we take
            care when preparing food, our kitchen handles common allergens and cannot guarantee that
            any item is completely allergen-free.
          </p>
          <p>
            © {new Date().getFullYear()} {restaurant.name}
            {restaurant.abn ? ` · ABN ${restaurant.abn}` : ""}.
          </p>
        </div>
      </div>
    </footer>
  );
}
