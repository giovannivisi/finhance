import { api } from "@lib/api";
import EditAssettForm from "@components/EditAssetForm";
import { ApiAsset } from "@lib/api-types";

export default async function EditAssettPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params; // Important!
  const asset = await api<ApiAsset>(`/assets/${id}`);


  return (
    <div>
      <EditAssettForm asset={asset}  />
    </div>
  );
}
