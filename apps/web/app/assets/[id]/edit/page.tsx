import { api } from "@lib/api";
import type { AssetResponse } from "@finhance/shared";
import EditAssetForm from "@components/EditAssetForm";

export default async function EditAssetPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const asset = await api<AssetResponse>(`/assets/${id}`);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <section className="page-hero">
        <p className="page-kicker">Portfolio</p>
        <h1 className="page-title is-compact">Edit asset</h1>
        <p className="page-description">
          Update valuation inputs, ownership details, and notes without leaving
          the main shell.
        </p>
      </section>
      <section className="page-form-card">
        <EditAssetForm asset={asset} />
      </section>
    </div>
  );
}
