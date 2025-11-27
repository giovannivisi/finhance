import { api } from "@lib/api";
import EditAccountForm from "@/components/EditAssetForm";

export default async function EditAccountPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params; // Important!
  const account = await api(`/accounts/${id}`);
  const categories = await api<any[]>("/categories");

  return (
    <div>
      <EditAccountForm account={account} categories={categories} />
    </div>
  );
}