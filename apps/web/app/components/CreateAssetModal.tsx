"use client";

import Modal from "./Modal";
import CreateAssetForm from "./CreateAssetForm";

export default function CreateAssetModal({
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
      <CreateAssetForm categories={categories} onSuccess={onClose} />
    </Modal>
  );
}