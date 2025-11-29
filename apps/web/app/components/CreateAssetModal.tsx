"use client";

import Modal from "./Modal";
import CreateAssetForm from "./CreateAssetForm";

export default function CreateAssetModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose}>
      <CreateAssetForm  onSuccess={onClose} />
    </Modal>
  );
}