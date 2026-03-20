import Link from "next/link";
import { ArrowRight, Database, Layers3, Network } from "lucide-react";

import { CategoryManager } from "@/components/admin/category-manager";
import { getDashboardData } from "@/lib/queries";
import type { CategoryOption } from "@/types";

type RecentWordSummary = {
  id: string;
  lemma: string;
  slug: string;
  plainEnglish: string;
  updatedAt: Date;
};

type ManagedCategory = CategoryOption & {
  _count: {
    words: number;
  };
};

export default async function AdminDashboardPage() {
  const data = await getDashboardData();
  const recentWords = data.recentWords as RecentWordSummary[];
  const categories = data.categories as ManagedCategory[];

  const stats = [
    { label: "Words", value: data.wordCount, icon: Database },
    { label: "Categories", value: data.categoryCount, icon: Layers3 },
    { label: "Relations", value: data.relationCount, icon: Network }
  ];

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="surface-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="section-label">{stat.label}</p>
                  <p className="mt-3 text-3xl text-slate-900">{stat.value}</p>
                </div>
                <div className="rounded-2xl bg-moss-50 p-3 text-moss-700">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section className="surface-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="section-label">Quick actions</p>
            <h2 className="mt-2 text-xl text-slate-900">Keep the prototype moving</h2>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Link href="/admin/words/new" className="surface-muted flex items-center justify-between p-4">
            <div>
              <p className="font-semibold text-slate-900">Add word</p>
              <p className="mt-1 text-sm text-slate-600">Create a new lexical record</p>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-400" />
          </Link>
          <Link href="/admin/words" className="surface-muted flex items-center justify-between p-4">
            <div>
              <p className="font-semibold text-slate-900">Review words</p>
              <p className="mt-1 text-sm text-slate-600">Search, edit, or delete entries</p>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-400" />
          </Link>
          <Link href="/admin/import" className="surface-muted flex items-center justify-between p-4">
            <div>
              <p className="font-semibold text-slate-900">Run import</p>
              <p className="mt-1 text-sm text-slate-600">Paste JSON or upload CSV</p>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-400" />
          </Link>
        </div>
      </section>

      <section className="surface-card p-5">
        <p className="section-label">Recently updated</p>
        <div className="mt-4 space-y-3">
          {recentWords.map((word) => (
            <Link key={word.id} href={`/admin/words/${word.id}/edit`} className="surface-muted block p-4">
              <p className="font-semibold text-slate-900">{word.lemma}</p>
              <p className="mt-1 text-sm text-slate-600">{word.plainEnglish}</p>
            </Link>
          ))}
        </div>
      </section>

      <CategoryManager
        initialCategories={categories}
      />
    </div>
  );
}
