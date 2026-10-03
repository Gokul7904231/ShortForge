/**
 * Legacy /api/generations compatibility facade.
 *
 * All generation execution is owned by the canonical /api/generate-video path.
 * This route intentionally contains no independent quota, model, provider,
 * retry, or economic admission logic.
 */
export { POST } from "../generate-video/route";
