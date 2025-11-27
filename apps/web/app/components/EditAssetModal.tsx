"use client";

import { useEffect, useState } from "react";
import Modal from "./Modal";
import EditAssetForm from "@components/EditAssetForm";

export default function EditAssetModal({
  assetId,
  open,
  onClose,
}: {
  assetId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [asset, setAsset] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    if (!open || !assetId) return;

    async function fetchData() {
      const base = process.env.NEXT_PUBLIC_API_URL;
      const accRes = await fetch(`${base}/assets/${assetId}`);
      const catRes = await fetch(`${base}/categories`);
      setAsset(await accRes.json());
      setCategories(await catRes.json());
    }

    fetchData();
  }, [open, assetId]);

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose}>
      {!asset ? (
        <p>Loading…</p>
      ) : (
        <EditAssetForm
          asset={asset}
          categories={categories}
          onSuccess={onClose}
        />
      )}
    </Modal>
  );
}