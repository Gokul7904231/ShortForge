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
  // Reject non-commercial or ambiguous licenses immediately
  if (!params.license.isCommercialAllowed) {
    return {
      id: params.id,
      provider: params.provider,
      assetUri: params.assetUri,
      mediaType: params.mediaType,
      dimensions: {
        width: params.width,
        height: params.height,
        aspectRatio: `${params.width}:${params.height}`,
      },
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
      rejectionReason: `Commercial use disallowed by license terms: ${params.license.spdxId}`,
    };
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

  const licenseConfidence = params.license.sourceUrl && params.license.spdxId ? 1.0 : 0.6;

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
    dimensions: {
      width: params.width,
      height: params.height,
      aspectRatio: `${params.width}:${params.height}`,
    },
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

