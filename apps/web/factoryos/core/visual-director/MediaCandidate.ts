/**
 * MediaCandidate — Multi-Signal Asset Selection & Provenance Contract
 * 
 * Enforces visible multi-signal ranking for candidate media assets.
 * Evaluates semantic embedding relevance, entity verification, resolution geometry,
 * and license provenance. Disallows admission of assets with unverified commercial rights.
 */

export type MediaCandidateProvider =
  | "b2"
  | "local"
  | "wikimedia"
  | "openverse"
  | "nasa"
  | "smithsonian"
  | "canva_pack";

export interface MediaLicenseInfo {
  spdxId: string;
  isCommercialAllowed: boolean;
  attributionRequired: boolean;
  attributionText?: string;
  sourceUrl?: string;
  authorName?: string;
}

export interface MediaRankingSignals {
  /** Contrastive embedding score (0.0 to 1.0) */
  semanticMatchScore: number;
  /** Exact entity/claim match verification (0.0 to 1.0) */
  entityMatchScore: number;
  /** Resolution and aspect ratio suitability for 1080x1920 (0.0 to 1.0) */
  resolutionScore: number;
  /** Legal clearance and provenance confidence (0.0 to 1.0) */
  licenseConfidence: number;
  /** Weighted composite rank score (0.0 to 1.0) */
  compositeScore: number;
}

export interface MediaCandidate {
  id: string;
  provider: MediaCandidateProvider;
  assetUri: string;
  mediaType: "image" | "video" | "vector";
  dimensions: {
    width: number;
    height: number;
    aspectRatio: string;
  };
  sha256: string;
  fileSizeBytes: number;
  license: MediaLicenseInfo;
  rankingSignals: MediaRankingSignals;
  isAdmitted: boolean;
  rejectionReason?: string;
}

export function rankMediaCandidate(params: {
  id: string;
  provider: MediaCandidateProvider;
  assetUri: string;
  mediaType: "image" | "video" | "vector";
  width: number;
  height: number;
  sha256: string;
  fileSizeBytes: number;
  license: MediaLicenseInfo;
  semanticMatchScore: number;
  entityMatchScore: number;
}): MediaCandidate {
  // Score range and dimension validation
  if (!Number.isFinite(params.semanticMatchScore) || params.semanticMatchScore < 0 || params.semanticMatchScore > 1) {
    throw new Error(`[MediaCandidate] Invalid semanticMatchScore: ${params.semanticMatchScore}. Must be between 0.0 and 1.0.`);
  }

  if (!Number.isFinite(params.entityMatchScore) || params.entityMatchScore < 0 || params.entityMatchScore > 1) {
    throw new Error(`[MediaCandidate] Invalid entityMatchScore: ${params.entityMatchScore}. Must be between 0.0 and 1.0.`);
  }

  if (!Number.isFinite(params.width) || params.width <= 0 || !Number.isFinite(params.height) || params.height <= 0) {
    throw new Error(`[MediaCandidate] Dimensions must be positive finite numbers (${params.width}x${params.height}).`);
  }

  const dimensions = {
    width: params.width,
    height: params.height,
    aspectRatio: `${params.width}:${params.height}`,
  };

  const createRejectedCandidate = (reason: string): MediaCandidate => ({
    id: params.id,
    provider: params.provider,
    assetUri: params.assetUri,
    mediaType: params.mediaType,
    dimensions,
    sha256: params.sha256,
    fileSizeBytes: params.fileSizeBytes,
    license: params.license,
    rankingSignals: {
      semanticMatchScore: params.semanticMatchScore,
      entityMatchScore: params.entityMatchScore,
      resolutionScore: 0,
      licenseConfidence: 0,
      compositeScore: 0,
    },
    isAdmitted: false,
    rejectionReason: reason,
  });

  // Priority 1: Fail closed on missing, ambiguous, or unverified licensing & provenance
  if (!params.license) {
    return createRejectedCandidate("Missing license metadata");
  }

  if (typeof params.license.isCommercialAllowed !== "boolean" || !params.license.isCommercialAllowed) {
    return createRejectedCandidate(`Commercial use disallowed or ambiguous rights: ${params.license.spdxId || "UNKNOWN"}`);
  }

  if (!params.license.spdxId || typeof params.license.spdxId !== "string" || params.license.spdxId.trim() === "" || params.license.spdxId.toUpperCase() === "UNKNOWN") {
    return createRejectedCandidate("Missing or invalid SPDX license identifier");
  }

  if (!params.license.sourceUrl || typeof params.license.sourceUrl !== "string" || params.license.sourceUrl.trim() === "") {
    return createRejectedCandidate("Missing license provenance source URL");
  }

  // Calculate resolution score: ideal is >= 1080x1920 (portrait) or >= 1920x1080 (landscape cropped)
  let resolutionScore = 0.5;
  if (params.width >= 1080 && params.height >= 1920) {
    resolutionScore = 1.0;
  } else if (params.width >= 1920 && params.height >= 1080) {
    resolutionScore = 0.85; // Landscape can be center-cropped
  } else if (params.width >= 720 && params.height >= 1280) {
    resolutionScore = 0.7;
  } else {
    resolutionScore = 0.3;
  }

  const licenseConfidence = 1.0; // Provenance verified with valid sourceUrl and spdxId

  // Composite multi-signal score:
  // 35% semantic relevance + 25% entity match + 15% resolution + 25% license confidence
  const compositeScore = Number(
    (
      params.semanticMatchScore * 0.35 +
      params.entityMatchScore * 0.25 +
      resolutionScore * 0.15 +
      licenseConfidence * 0.25
    ).toFixed(4)
  );

  const isAdmitted = compositeScore >= 0.60;

  return {
    id: params.id,
    provider: params.provider,
    assetUri: params.assetUri,
    mediaType: params.mediaType,
    dimensions,
    sha256: params.sha256,
    fileSizeBytes: params.fileSizeBytes,
    license: params.license,
    rankingSignals: {
      semanticMatchScore: params.semanticMatchScore,
      entityMatchScore: params.entityMatchScore,
      resolutionScore,
      licenseConfidence,
      compositeScore,
    },
    isAdmitted,
    rejectionReason: isAdmitted ? undefined : `Composite ranking score (${compositeScore}) fell below minimum threshold (0.60)`,
  };
}

