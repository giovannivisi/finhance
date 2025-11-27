"use client";

import Modal from "./Modal";
import CreateAccountForm from "./CreateAccountForm";

export default function CreateAccountModal({
  open,
  onClose,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  categories: any[];
}) {
  return (
    <Modal open={open} onClose={onClose}>
      <CreateAccountForm categories={categories} onSuccess={onClose} />
    </Modal>
  );
}