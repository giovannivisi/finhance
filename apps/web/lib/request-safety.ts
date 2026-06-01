interface RequestSafetyErrorInput {
  status: number | null;
  error: string;
}

const CALM_REPEATED_ACTION_ERRORS = [
  {
    status: 409,
    prefix: "Refresh already in progress.",
  },
  {
    status: 429,
    prefix: "Refresh is cooling down.",
  },
  {
    status: 409,
    prefix: "Snapshot capture already in progress.",
  },
  {
    status: 409,
    prefix: "Recurring materialization already in progress.",
  },
  {
    status: 429,
    prefix: "Recurring materialization is cooling down.",
  },
] as const;

export function getRepeatedActionNotice(
  input: RequestSafetyErrorInput,
): string | null {
  for (const expectedError of CALM_REPEATED_ACTION_ERRORS) {
    if (
      input.status === expectedError.status &&
      input.error.startsWith(expectedError.prefix)
    ) {
      return input.error;
    }
  }

  return null;
}
