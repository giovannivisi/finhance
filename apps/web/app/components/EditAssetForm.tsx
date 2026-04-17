"use client";

import { useMemo } from "react";
import type { AssetResponse } from "@finhance/shared";
import AssetForm from "@components/AssetForm";
import { assetToFormValues } from "@lib/asset-form";

export default function EditAssetForm({
  asset,
  onSuccess,
}: {
  asset: AssetResponse;
  onSuccess?: () => void;
}) {
  const initialValues = useMemo(() => assetToFormValues(asset), [asset]);

  return (
    <AssetForm
      mode="edit"
      assetId={asset.id}
      initialValues={initialValues}
      onSuccess={onSuccess}
    />
  );
}
