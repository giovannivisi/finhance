import {
  IMPORT_TEMPLATE_HEADERS,
  IMPORT_TEMPLATE_OPTIONAL_HEADERS,
  type ImportFileType,
} from "@finhance/shared/imports";

export interface ImportHeaderHint {
  file: ImportFileType;
  matchedHeaders: number;
  totalHeaders: number;
}

export interface ImportHeaderInference {
  inferredFile: ImportFileType | null;
  reason: string | null;
  hint: ImportHeaderHint | null;
}

const IMPORT_FILE_TYPES = Object.keys(
  IMPORT_TEMPLATE_HEADERS,
) as ImportFileType[];

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentField += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && character === ",") {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if (!inQuotes && (character === "\n" || character === "\r")) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = "";
      continue;
    }

    currentField += character;
  }

  if (inQuotes) {
    throw new Error(
      "CSV parsing failed because a quoted field was not closed.",
    );
  }

  currentRow.push(currentField);
  rows.push(currentRow);
  return rows;
}

export function parseCsvHeaders(text: string): string[] {
  const normalizedText = text.replace(/^\uFEFF/, "");
  const rows = parseCsvRows(normalizedText);

  if (rows.length === 0 || rows[0]?.every((cell) => cell.trim() === "")) {
    throw new Error("CSV file is empty.");
  }

  return rows[0].map((value) => value.trim());
}

function getOptionalHeaders(file: ImportFileType): readonly string[] {
  return IMPORT_TEMPLATE_OPTIONAL_HEADERS[file] ?? [];
}

function getMatchedHeaders(
  headers: readonly string[],
  expectedHeaders: readonly string[],
): number {
  return expectedHeaders.filter((header) => headers.includes(header)).length;
}

function getEffectiveHeaderCount(
  file: ImportFileType,
  headers: readonly string[],
): number {
  const expectedHeaders = IMPORT_TEMPLATE_HEADERS[file];
  const optionalHeaders = getOptionalHeaders(file);
  const omittedOptionalHeaders = optionalHeaders.filter(
    (header) => !headers.includes(header),
  ).length;

  return expectedHeaders.length - omittedOptionalHeaders;
}

function isAcceptedHeaderMatch(
  file: ImportFileType,
  headers: readonly string[],
): boolean {
  const expectedHeaders = IMPORT_TEMPLATE_HEADERS[file];
  const optionalHeaders = getOptionalHeaders(file);
  const unknownHeaders = headers.filter(
    (header) => !expectedHeaders.includes(header),
  );
  const missingHeaders = expectedHeaders.filter(
    (header) => !headers.includes(header) && !optionalHeaders.includes(header),
  );

  return unknownHeaders.length === 0 && missingHeaders.length === 0;
}

export function inferImportFileTypeFromHeaders(
  headers: readonly string[],
): ImportHeaderInference {
  const acceptedMatches = IMPORT_FILE_TYPES.filter((file) =>
    isAcceptedHeaderMatch(file, headers),
  );

  if (acceptedMatches.length === 1) {
    return {
      inferredFile: acceptedMatches[0] ?? null,
      reason: null,
      hint: null,
    };
  }

  const scoredMatches = IMPORT_FILE_TYPES.map((file) => ({
    file,
    matchedHeaders: getMatchedHeaders(headers, IMPORT_TEMPLATE_HEADERS[file]),
    totalHeaders: getEffectiveHeaderCount(file, headers),
  })).sort((left, right) => right.matchedHeaders - left.matchedHeaders);

  const topMatch = scoredMatches[0];
  const secondMatch = scoredMatches[1];
  const hasUniqueTopMatch =
    topMatch &&
    topMatch.matchedHeaders > 0 &&
    (!secondMatch || secondMatch.matchedHeaders < topMatch.matchedHeaders);

  return {
    inferredFile: null,
    reason: "Could not infer file category from headers.",
    hint: hasUniqueTopMatch ? topMatch : null,
  };
}

export async function readImportFileHeaders(
  file: Pick<File, "text">,
): Promise<string[]> {
  return parseCsvHeaders(await file.text());
}
