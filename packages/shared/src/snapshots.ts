export interface NetWorthSnapshotResponse {
  id: string;
  snapshotDate: string;
  capturedAt: string;
  baseCurrency: string;
  assetsTotal: number;
  liabilitiesTotal: number;
  netWorthTotal: number;
  unavailableCount: number;
  isPartial: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SnapshotCaptureResponse = NetWorthSnapshotResponse;
