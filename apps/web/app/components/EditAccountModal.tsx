"use client";

import { useEffect, useState } from "react";
import Modal from "./Modal";
import EditAccountForm from "./EditAccountForm";

export default function EditAccountModal({
  accountId,
  open,
  onClose,
}: {
  accountId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [account, setAccount] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    if (!open || !accountId) return;

    async function fetchData() {
      const base = process.env.NEXT_PUBLIC_API_URL;
      const accRes = await fetch(`${base}/accounts/${accountId}`);
      const catRes = await fetch(`${base}/categories`);
      setAccount(await accRes.json());
      setCategories(await catRes.json());
    }

    fetchData();
  }, [open, accountId]);

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose}>
      {!account ? (
        <p>Loading…</p>
      ) : (
        <EditAccountForm
          account={account}
          categories={categories}
          onSuccess={onClose}
        />
      )}
    </Modal>
  );
}