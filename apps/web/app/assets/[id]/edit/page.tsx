import { api } from "@lib/api";
import type { AssetResponse } from "@finhance/shared";
import EditAssetForm from "@components/EditAssetForm";

export default async function EditAssetPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const asset = await api<AssetResponse>(`/assets/${id}`);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Edit asset</h1>
      <EditAssetForm asset={asset} />
    </div>
  );
}
