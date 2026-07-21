import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

interface ReceiptOcrNativeModule {
  recognizeTextAsync(uri: string): Promise<string>;
}

const receiptOcrModule =
  requireOptionalNativeModule<ReceiptOcrNativeModule>("FinhanceReceiptOcr");

export function isReceiptOcrAvailable(): boolean {
  return Platform.OS === "ios" && receiptOcrModule !== null;
}

export async function recogniseReceiptText(imageUri: string): Promise<string> {
  if (Platform.OS !== "ios" || !receiptOcrModule) {
    throw new Error(
      "Receipt scanning needs the latest finhance iPhone development build.",
    );
  }

  return receiptOcrModule.recognizeTextAsync(imageUri);
}
