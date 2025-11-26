import { api } from "@lib/api";
import EditAccountForm from "@components/EditAccountForm";

export default async function EditAccountPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params; // Important!
  const account = await api(`/accounts/${id}`);

  return (
    <div>
      <EditAccountForm account={account} />
    </div>
  );
}