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

  useEffect(() => {
    if (!open || !assetId) return;

    async function fetchData() {
      const base = process.env.NEXT_PUBLIC_API_URL;
      const accRes = await fetch(`${base}/assets/${assetId}`);
      setAsset(await accRes.json());
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
          onSuccess={onClose}
        />
      )}
    </Modal>
  );
}