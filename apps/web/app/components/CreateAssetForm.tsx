"use client";

import { useMemo } from "react";
import AssetForm from "@components/AssetForm";
import { createEmptyAssetFormValues } from "@lib/asset-form";

export default function CreateAssetForm({
  onSuccess,
}: {
  onSuccess?: () => void;
}) {
  const initialValues = useMemo(() => createEmptyAssetFormValues(), []);

  return (
    <AssetForm
      mode="create"
      initialValues={initialValues}
      onSuccess={onSuccess}
    />
  );
}
