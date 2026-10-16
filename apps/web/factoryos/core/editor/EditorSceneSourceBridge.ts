/**
 * Joins canonical F03 scene plans to media locators already produced for the
 * same stable scene IDs. This bridge never infers a media locator from a prompt,
 * a logical asset ID, or array position. The source package builder remains
 * responsible for verifying bytes, ownership, MIME type, and digest.
 */
export type EditorSceneSourceRow = Record<string, unknown>;

function stableSceneId(row: EditorSceneSourceRow): string | null {
  const value = row.sceneId ?? row.scene_id;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function sourceProvenance(
  planned: EditorSceneSourceRow,
  existing: EditorSceneSourceRow | undefined,
): Record<string, unknown> | undefined {
  const candidate = record(planned.sourceProvenance) ??
    record(planned.source_provenance) ??
    record(existing?.sourceProvenance) ??
    record(existing?.source_provenance);
  if (!candidate) return undefined;
  const allowed: Record<string, unknown> = {};
  for (const key of ["sha256", "mimeType", "sourceAssetId", "provider", "license", "author", "sourceUrl"]) {
    if (typeof candidate[key] === "string" && candidate[key].trim()) allowed[key] = candidate[key].trim();
  }
  if (typeof candidate.attributionRequired === "boolean") {
    allowed.attributionRequired = candidate.attributionRequired;
  }
  return Object.keys(allowed).length ? allowed : undefined;
}

function supportedMediaType(value: unknown): "IMAGE" | "VIDEO" | undefined {
  return value === "IMAGE" || value === "VIDEO" ? value : undefined;
}

export function mergeEditorSceneSources<T extends EditorSceneSourceRow>(
  plannedScenes: readonly T[],
  existingScenes: readonly unknown[] | null | undefined,
): T[] {
  const bySceneId = new Map<string, EditorSceneSourceRow[]>();
  for (const candidate of existingScenes ?? []) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const row = candidate as EditorSceneSourceRow;
    const id = stableSceneId(row);
    if (!id) continue;
    const matches = bySceneId.get(id) ?? [];
    matches.push(row);
    bySceneId.set(id, matches);
  }

  return plannedScenes.map((planned) => {
    const id = stableSceneId(planned);
    const matches = id ? bySceneId.get(id) : undefined;
    // Duplicate IDs are ambiguous and fail closed instead of choosing a source
    // by ordering. The canonical plan remains authoritative for scene semantics.
    const existing = matches?.length === 1 ? matches[0] : undefined;
    const plannedImage = nonEmptyString(planned.imageUrl);
    const existingImage = nonEmptyString(existing?.imageUrl);
    const plannedProvenance = sourceProvenance(planned, undefined);
    const existingProvenance = existing ? sourceProvenance(existing, undefined) : undefined;
    // A canonical scene's existing source remains authoritative when it has its
    // own provenance. A newly retrieved, provenance-backed source replaces an
    // unproven placeholder or stale locator.
    const usePlannedSource = Boolean(plannedImage) &&
      (Boolean(plannedProvenance) || !existingImage || !existingProvenance);
    const imageUrl = usePlannedSource ? plannedImage : existingImage ?? plannedImage;
    const mediaType = usePlannedSource
      ? supportedMediaType(planned.mediaType) ?? supportedMediaType(existing?.mediaType)
      : supportedMediaType(existing?.mediaType) ?? supportedMediaType(planned.mediaType);
    const provenance = usePlannedSource
      ? plannedProvenance ?? existingProvenance
      : existingProvenance ?? plannedProvenance;

    return {
      ...planned,
      ...(imageUrl ? { imageUrl } : {}),
      ...(mediaType ? { mediaType } : {}),
      ...(provenance ? { sourceProvenance: provenance } : {}),
    } as T;
  });
}
