/** "94%": the confidence shown to users, never rounded up past what the model said. */
export function confidenceText(probability: number): string {
  return `${Math.floor(probability * 100)}%`;
}
