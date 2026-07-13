const SPECIAL_CATEGORY_PATTERNS = [
  /\b(?:doctor|dottore|therapy|therapist|terapia|hospital|ospedale|clinic|clinica|pharmacy|farmacia|medication|medicine|medicina|psychologist|psicologo)\b/i,
  /\b(?:church|chiesa|mosque|moschea|synagogue|sinagoga|parish|parrocchia|religion|religione)\b/i,
  /\b(?:trade union|union dues|sindacato|cgil|cisl|uil)\b/i,
];

/**
 * Conservative defence-in-depth screening before optional cloud processing.
 * A heuristic result remains available when a phrase may reveal special data.
 */
export function hasLikelySpecialCategoryData(value: string): boolean {
  return SPECIAL_CATEGORY_PATTERNS.some((pattern) => pattern.test(value));
}
