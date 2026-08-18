import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ImageUp, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createMenuItemFn, deleteMenuItemFn, uploadMenuImageFn } from "@/api/menu";
import { dietTags, type DietTag, type MenuCatalog } from "@/domain/menu";
import { menuImageOptions, imageForMenuKey } from "@/lib/menu-data";
import { prepareMenuImage } from "@/lib/menu-image-client";
import { usePublicMenu } from "@/lib/public-menu";
import { formatAUD, restaurant } from "@/lib/restaurant";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const TOKEN_STORAGE_KEY = "rogane-admin-access-token";

type FormState = {
  name: string;
  koreanName: string;
  description: string;
  price: string;
  categoryId: string;
  imageKey: string;
  spiceLevel: "0" | "1" | "2" | "3";
  dietTags: DietTag[];
  popular: boolean;
  chefsPick: boolean;
  soldOut: boolean;
};

const emptyForm: FormState = {
  name: "",
  koreanName: "",
  description: "",
  price: "",
  categoryId: "",
  imageKey: menuImageOptions[0]!.key,
  spiceLevel: "0",
  dietTags: [],
  popular: false,
  chefsPick: false,
  soldOut: false,
};

export const Route = createFileRoute("/admin/menu")({
  head: () => ({ meta: [{ title: "Menu management | Rogane Chimac" }] }),
  component: AdminMenuPage,
});

function AdminMenuPage() {
  const queryClient = useQueryClient();
  const menuQuery = usePublicMenu();
  const [adminToken, setAdminToken] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);

  useEffect(() => {
    setAdminToken(sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? "");
  }, []);

  useEffect(() => {
    const firstCategory = menuQuery.data?.categories[0]?.id;
    if (firstCategory && !form.categoryId) {
      setForm((current) => ({ ...current, categoryId: firstCategory }));
    }
  }, [form.categoryId, menuQuery.data]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const priceDollars = Number(form.price);
      if (!Number.isFinite(priceDollars) || priceDollars < 0) {
        throw new Error("Enter a valid price in Australian dollars.");
      }
      return createMenuItemFn({
        data: {
          restaurantSlug: restaurant.slug,
          adminToken,
          categoryId: form.categoryId,
          name: form.name,
          koreanName: form.koreanName || undefined,
          description: form.description,
          priceCents: Math.round(priceDollars * 100),
          imageKey: form.imageKey,
          dietTags: form.dietTags,
          spiceLevel: Number(form.spiceLevel) as 0 | 1 | 2 | 3,
          popular: form.popular,
          chefsPick: form.chefsPick,
          soldOut: form.soldOut,
        },
      });
    },
    onSuccess: (catalog) => {
      updateCatalog(queryClient, catalog);
      setForm((current) => ({ ...emptyForm, categoryId: current.categoryId }));
      toast.success("Menu item added.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (menuItemId: string) =>
      deleteMenuItemFn({
        data: { restaurantSlug: restaurant.slug, adminToken, menuItemId },
      }),
    onSuccess: (catalog) => {
      updateCatalog(queryClient, catalog);
      toast.success("Menu item deleted.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ menuItemId, file }: { menuItemId: string; file: File }) => {
      const image = await prepareMenuImage(file);
      return uploadMenuImageFn({
        data: {
          restaurantSlug: restaurant.slug,
          adminToken,
          menuItemId,
          ...image,
        },
      });
    },
    onSuccess: (catalog) => {
      updateCatalog(queryClient, catalog);
      toast.success("Dish photo updated.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const catalog = menuQuery.data;
  const itemsByCategory = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof catalog>["items"]>();
    for (const category of catalog?.categories ?? []) groups.set(category.id, []);
    for (const item of catalog?.items ?? []) groups.get(item.categoryId)?.push(item);
    return groups;
  }, [catalog]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!adminToken) {
      toast.error("Enter the admin access token first.");
      return;
    }
    sessionStorage.setItem(TOKEN_STORAGE_KEY, adminToken);
    createMutation.mutate();
  };

  const confirmDelete = (menuItemId: string, name: string) => {
    if (!adminToken) {
      toast.error("Enter the admin access token first.");
      return;
    }
    if (!window.confirm(`Delete ${name}? This removes it from the public menu.`)) return;
    sessionStorage.setItem(TOKEN_STORAGE_KEY, adminToken);
    deleteMutation.mutate(menuItemId);
  };

  const uploadPhoto = (menuItemId: string, file: File) => {
    if (!adminToken) {
      toast.error("Enter the admin access token first.");
      return;
    }
    sessionStorage.setItem(TOKEN_STORAGE_KEY, adminToken);
    uploadMutation.mutate({ menuItemId, file });
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-primary">Menu</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold">Manage dishes</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Changes are saved to PostgreSQL and appear on the public menu and ordering pages.
        </p>
      </div>

      <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
        <Label htmlFor="admin-token">Admin access token</Label>
        <div className="mt-2 flex max-w-xl gap-2">
          <Input
            id="admin-token"
            type="password"
            autoComplete="off"
            value={adminToken}
            onChange={(event) => setAdminToken(event.target.value)}
            placeholder="Value of ADMIN_ACCESS_TOKEN"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              sessionStorage.setItem(TOKEN_STORAGE_KEY, adminToken);
              toast.success("Token saved for this browser tab.");
            }}
          >
            Save
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Stored in this browser tab only. It is required for adding, deleting and changing dish
          photos.
        </p>
      </section>

      <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
        <h2 className="font-display text-xl font-bold">Add a dish</h2>
        <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={submit}>
          <Field label="Dish name" htmlFor="dish-name">
            <Input
              id="dish-name"
              required
              minLength={2}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label="Korean name (optional)" htmlFor="dish-korean-name">
            <Input
              id="dish-korean-name"
              value={form.koreanName}
              onChange={(event) => setForm({ ...form, koreanName: event.target.value })}
            />
          </Field>
          <Field label="Price (AUD)" htmlFor="dish-price">
            <Input
              id="dish-price"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              required
              value={form.price}
              onChange={(event) => setForm({ ...form, price: event.target.value })}
              placeholder="18.90"
            />
          </Field>
          <Field label="Category" htmlFor="dish-category">
            <select
              id="dish-category"
              required
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={form.categoryId}
              onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
            >
              {(menuQuery.data?.categories ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Photo style" htmlFor="dish-image">
            <select
              id="dish-image"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={form.imageKey}
              onChange={(event) => setForm({ ...form, imageKey: event.target.value })}
            >
              {menuImageOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Spice level" htmlFor="dish-spice">
            <select
              id="dish-spice"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={form.spiceLevel}
              onChange={(event) =>
                setForm({ ...form, spiceLevel: event.target.value as FormState["spiceLevel"] })
              }
            >
              <option value="0">Not spicy</option>
              <option value="1">Mild</option>
              <option value="2">Spicy</option>
              <option value="3">Extra spicy</option>
            </select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Description" htmlFor="dish-description">
              <Textarea
                id="dish-description"
                required
                minLength={5}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </Field>
          </div>
          <div className="md:col-span-2">
            <p className="text-sm font-medium">Dietary tags</p>
            <div className="mt-2 flex flex-wrap gap-4">
              {dietTags.map((tag) => (
                <label key={tag} className="inline-flex items-center gap-2 text-sm capitalize">
                  <Checkbox
                    checked={form.dietTags.includes(tag)}
                    onCheckedChange={(checked) =>
                      setForm({
                        ...form,
                        dietTags: checked
                          ? [...form.dietTags, tag]
                          : form.dietTags.filter((value) => value !== tag),
                      })
                    }
                  />
                  {tag}
                </label>
              ))}
            </div>
          </div>
          <div className="md:col-span-2 flex flex-wrap gap-5">
            {(
              [
                ["popular", "Popular"],
                ["chefsPick", "Chef's pick"],
                ["soldOut", "Sold out"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="inline-flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form[key]}
                  onCheckedChange={(checked) => setForm({ ...form, [key]: checked === true })}
                />{" "}
                {label}
              </label>
            ))}
          </div>
          <div className="md:col-span-2">
            <Button
              type="submit"
              disabled={createMutation.isPending || menuQuery.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary-dark"
            >
              <Plus className="mr-2 h-4 w-4" /> {createMutation.isPending ? "Adding…" : "Add dish"}
            </Button>
          </div>
        </form>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold">Current menu</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a JPEG, PNG or WebP photo for each dish. It will be resized and compressed
              before upload.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => menuQuery.refetch()}
            disabled={menuQuery.isFetching}
          >
            Refresh
          </Button>
        </div>
        {menuQuery.isPending ? (
          <p className="mt-4 text-muted-foreground">Loading menu…</p>
        ) : menuQuery.isError ? (
          <p className="mt-4 text-destructive">The menu could not be loaded.</p>
        ) : (
          <div className="mt-4 space-y-6">
            {menuQuery.data.categories.map((category) => (
              <div key={category.id}>
                <h3 className="font-display font-bold">{category.name}</h3>
                <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {(itemsByCategory.get(category.id) ?? []).map((item) => (
                    <article
                      key={item.id}
                      className="flex gap-3 rounded-2xl border border-border bg-card p-3"
                    >
                      <img
                        src={imageForMenuKey(item.imageKey)}
                        alt={item.name}
                        className="h-20 w-20 shrink-0 rounded-xl object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{item.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatAUD(item.priceCents)}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            asChild
                            aria-disabled={uploadMutation.isPending}
                          >
                            <label htmlFor={`photo-${item.id}`}>
                              {uploadMutation.isPending &&
                              uploadMutation.variables?.menuItemId === item.id ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <ImageUp className="mr-1 h-3.5 w-3.5" />
                              )}
                              {item.imageKey.startsWith("uploaded:") ? "Replace" : "Upload"}
                            </label>
                          </Button>
                          <input
                            id={`photo-${item.id}`}
                            type="file"
                            className="sr-only"
                            accept="image/jpeg,image/png,image/webp"
                            disabled={uploadMutation.isPending}
                            onChange={(event) => {
                              const file = event.currentTarget.files?.[0];
                              event.currentTarget.value = "";
                              if (file) uploadPhoto(item.id, file);
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-destructive hover:text-destructive"
                            disabled={
                              deleteMutation.isPending && deleteMutation.variables === item.id
                            }
                            onClick={() => confirmDelete(item.id, item.name)}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function updateCatalog(queryClient: ReturnType<typeof useQueryClient>, catalog: MenuCatalog) {
  queryClient.setQueryData(["menu", restaurant.slug], catalog);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The menu could not be updated.";
}
