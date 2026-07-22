import { File } from "expo-file-system";

/** Removes the private cache copy created by expo-image-picker. */
export function deleteTemporaryReceiptImage(uri: string): void {
  const file = new File(uri);

  if (file.exists) {
    file.delete();
  }
}
