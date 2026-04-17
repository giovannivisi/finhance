"use client";

import { useEffect, useState } from "react";
import type { AssetResponse } from "@finhance/shared";
import Modal from "./Modal";
import EditAssetForm from "@components/EditAssetForm";
import { getApiUrl, readApiError } from "@lib/api";

export default function EditAssetModal({
  assetId,
  open,
  onClose,
}: {
  assetId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [asset, setAsset] = useState<AssetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !assetId) {
      return;
    }

    let isCancelled = false;

    async function fetchData() {
      setError(null);
      setAsset(null);

      try {
        const assetResponse = await fetch(getApiUrl(`/assets/${assetId}`), {
          cache: "no-store",
        });

        if (!assetResponse.ok) {
          if (!isCancelled) {
            setError(await readApiError(assetResponse));
          }
          return;
        }

        if (!isCancelled) {
          setAsset(await assetResponse.json());
        }
      } catch (fetchError) {
        if (!isCancelled) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Unable to load this asset.",
          );
        }
      }
    }

    void fetchData();

    return () => {
      isCancelled = true;
    };
  }, [open, assetId]);

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={asset ? `Edit ${asset.name}` : "Edit asset"}
    >
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : !asset ? (
        <p>Loading…</p>
      ) : (
        <EditAssetForm asset={asset} onSuccess={onClose} />
      )}
    </Modal>
  );
}
