import { api } from "@lib/api";
import EditAssettForm from "@components/EditAssetForm";

export default async function EditAssettPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params; // Important!
  const asset = await api(`/assets/${id}`);


  return (
    <div>
      <EditAssettForm asset={asset}  />
    </div>
  );
}