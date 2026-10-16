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
    const imageUrl = nonEmptyString(planned.imageUrl) ?? nonEmptyString(existing?.imageUrl);
    const mediaType = supportedMediaType(planned.mediaType) ?? supportedMediaType(existing?.mediaType);

    return {
      ...planned,
      ...(imageUrl ? { imageUrl } : {}),
      ...(mediaType ? { mediaType } : {}),
    } as T;
  });
}
