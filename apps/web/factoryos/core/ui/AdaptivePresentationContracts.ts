import { z } from "zod";

const boundedLabel = z.string().trim().min(1).max(80);
const boundedText = z.string().trim().min(1).max(500);

/**
 * Small allow-listed UI vocabulary. Payloads carry data only: no HTML, scripts,
 * component names, URLs-to-execute, or arbitrary host action descriptors.
 */
export const AdaptivePresentationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("summary"),
    title: boundedLabel,
    summary: boundedText,
  }).strict(),
  z.object({
    kind: z.literal("metric-grid"),
    title: boundedLabel,
    items: z.array(z.object({
      label: boundedLabel,
      value: z.union([z.string().trim().max(100), z.number().finite().nonnegative()]),
    }).strict()).min(1).max(8),
  }).strict(),
  z.object({
    kind: z.literal("alert"),
    severity: z.enum(["info", "warning", "error"]),
    title: boundedLabel,
    message: boundedText,
  }).strict(),
]);

export type AdaptivePresentationPayload = z.infer<typeof AdaptivePresentationSchema>;

export type AdaptivePresentationResolution =
  | { readonly success: true; readonly presentation: AdaptivePresentationPayload }
  | { readonly success: false; readonly reason: "INVALID_PRESENTATION"; readonly issues: readonly string[] };

export function resolveAdaptivePresentation(input: unknown): AdaptivePresentationResolution {
  const result = AdaptivePresentationSchema.safeParse(input);
  if (result.success) return { success: true, presentation: result.data };

  return {
    success: false,
    reason: "INVALID_PRESENTATION",
    issues: result.error.issues.map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "$";
      return `${path}: ${issue.message}`;
    }),
  };
}
