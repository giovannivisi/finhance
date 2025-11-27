"use client";

import { useState } from "react";
import CreateAccountModal from "@components/CreateAccountModal";
import EditAccountModal from "@components/EditAccountModal";
import DeleteAccountButton from "@components/DeleteAccountButton";
import { formatCurrency } from "@lib/format";
import HeaderAddButton from "./HeaderAddButton";
import SectionHeader from "@components/SectionHeader";

type Account = {
  id: string;
  name: string;
  balance: number;
  type: string;
  category?: { name: string } | null;
};

export default function DashboardClient({
  grouped,
  categories,
  categoryTotals,
}: {
  grouped: Record<string, Account[]>;
  categories: any[];
  categoryTotals: { category: string; total: number }[];
}) {
  const [editAccountId, setEditAccountId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const sortedCategories = Object.keys(grouped).sort();

  return (
    <>
    <SectionHeader title="Category Totals" />

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {categoryTotals.map(({ category, total }) => (
        <div
          key={category}
          className="bg-white shadow rounded-2xl p-4 text-center border border-gray-100"
        >
          <p className="text-sm text-gray-600 font-medium">{category}</p>
          <p
            className={`text-xl font-semibold ${
              total < 0 ? "text-red-600" : "text-green-600"
            }`}
          >
            {formatCurrency(total)}
          </p>
        </div>
      ))}
    </div>
    <SectionHeader
        title="Accounts"
        action={<HeaderAddButton onClick={() => setCreateOpen(true)} />}
     />
      {/* Render grouped accounts */}
      <div className="space-y-6">
        {sortedCategories.map((category) => (
          <div key={category}>
            <h3 className="text-lg font-semibold mb-2">{category}</h3>

            <ul className="space-y-2">
              {grouped[category].map((acc) => (
                <li
                  key={acc.id}
                  className="bg-white shadow rounded-2xl p-4 flex items-center justify-between border border-gray-100"
                >
                  <div>
                    <p className="font-medium">{acc.name}</p>
                    <p className="text-sm text-gray-500">
                      {acc.type} — {formatCurrency(acc.balance)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setEditAccountId(acc.id)}
                      className="text-blue-600 hover:underline"
                    >
                      Edit
                    </button>

                    <DeleteAccountButton id={acc.id} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <EditAccountModal
        accountId={editAccountId}
        open={Boolean(editAccountId)}
        onClose={() => setEditAccountId(null)}
      />

      <CreateAccountModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        categories={categories}
      />
    
    </>
  );
}