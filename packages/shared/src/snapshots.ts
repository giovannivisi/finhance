export interface NetWorthSnapshotResponse {
  id: string;
  snapshotDate: string;
  capturedAt: string;
  reportingCurrency: string;
  storedReportingCurrency: string;
  assetsTotal: number;
  liabilitiesTotal: number;
  netWorthTotal: number;
  unavailableCount: number;
  isPartial: boolean;
  canRecomputeForReportingCurrency: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SnapshotCaptureResponse = NetWorthSnapshotResponse;
