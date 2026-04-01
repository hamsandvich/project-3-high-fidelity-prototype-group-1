"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { slugify } from "@/lib/utils";
import type { CategoryOption } from "@/types";

type ManagedCategory = CategoryOption & {
  _count?: {
    words: number;
  };
};

type CategoryManagerProps = {
  initialCategories: ManagedCategory[];
};

const EMPTY_CATEGORY = {
  name: "",
  slug: "",
  description: "",
  colorToken: ""
};

export function CategoryManager({ initialCategories }: CategoryManagerProps) {
  const [categories, setCategories] = useState(initialCategories);
  const [newCategory, setNewCategory] = useState(EMPTY_CATEGORY);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="space-y-4">
      <section className="surface-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="section-label">Create category</p>
            <h2 className="mt-2 text-xl text-slate-900">Add a theme or domain</h2>
          </div>
          <span className="chip">{categories.length} total</span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            value={newCategory.name}
            onChange={(event) =>
              setNewCategory((current) => ({
                ...current,
                name: event.target.value,
                slug: slugify(event.target.value)
              }))
            }
            className="app-input"
            placeholder="Category name"
          />
          <input
            value={newCategory.slug}
            onChange={(event) => setNewCategory((current) => ({ ...current, slug: event.target.value }))}
            className="app-input"
            placeholder="Slug"
          />
          <textarea
            value={newCategory.description}
            onChange={(event) => setNewCategory((current) => ({ ...current, description: event.target.value }))}
            className="app-input md:col-span-2"
            rows={3}
            placeholder="Short description"
          />
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <button
          type="button"
          className="tap-button-primary mt-4"
          disabled={isPending}
          onClick={() => {
            setError("");
            startTransition(async () => {
              const response = await fetch("/api/admin/categories", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newCategory)
              });

              if (!response.ok) {
                const payload = (await response.json().catch(() => null)) as { error?: string } | null;
                setError(payload?.error ?? "Unable to create category.");
                return;
              }

              const payload = (await response.json()) as { category: ManagedCategory };
              setCategories((current) => [...current, payload.category].sort((a, b) => a.name.localeCompare(b.name)));
              setNewCategory(EMPTY_CATEGORY);
              router.refresh();
            });
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add category
        </button>
      </section>

      <section className="space-y-3">
        {categories.map((category) => (
          <div key={category.id} className="surface-card p-5">
            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={category.name}
                onChange={(event) =>
                  setCategories((current) =>
                    current.map((item) =>
                      item.id === category.id
                        ? { ...item, name: event.target.value, slug: slugify(event.target.value) || item.slug }
                        : item
                    )
                  )
                }
                className="app-input"
                placeholder="Category name"
              />
              <input
                value={category.slug}
                onChange={(event) =>
                  setCategories((current) =>
                    current.map((item) => (item.id === category.id ? { ...item, slug: event.target.value } : item))
                  )
                }
                className="app-input"
                placeholder="Slug"
              />
              <textarea
                value={category.description ?? ""}
                onChange={(event) =>
                  setCategories((current) =>
                    current.map((item) =>
                      item.id === category.id ? { ...item, description: event.target.value } : item
                    )
                  )
                }
                className="app-input md:col-span-2"
                rows={3}
                placeholder="Description"
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="chip">{category._count?.words ?? 0} linked words</span>
              <div className="flex gap-2">
                <Link href={`/admin/words?category=${category.id}`} className="tap-button-secondary">
                  View words
                </Link>
                <button
                  type="button"
                  className="tap-button-secondary"
                  disabled={isPending}
                  onClick={() => {
                    setError("");
                    startTransition(async () => {
                      const response = await fetch(`/api/admin/categories/${category.id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(category)
                      });

                      if (!response.ok) {
                        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
                        setError(payload?.error ?? "Unable to update category.");
                        return;
                      }

                      router.refresh();
                    });
                  }}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="tap-button-secondary"
                  disabled={isPending}
                  onClick={() => {
                    if (!window.confirm(`Delete the category "${category.name}"?`)) {
                      return;
                    }

                    setError("");
                    startTransition(async () => {
                      const response = await fetch(`/api/admin/categories/${category.id}`, {
                        method: "DELETE"
                      });

                      if (!response.ok) {
                        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
                        setError(payload?.error ?? "Unable to delete category.");
                        return;
                      }

                      setCategories((current) => current.filter((item) => item.id !== category.id));
                      router.refresh();
                    });
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
