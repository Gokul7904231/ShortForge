export interface QualityThresholds {
  readonly minVideoWidth: number;
  readonly minVideoHeight: number;
  readonly expectedAspectRatio: string;
  readonly minDurationSeconds: number;
  readonly maxDurationSeconds: number;
  readonly minAudioBytes: number;
  readonly minVideoBytes: number;
  readonly minVerificationScore: number;
  readonly requireH264: boolean;
  readonly requireAAC: boolean;
  readonly requireDecodeSmoke: boolean;
}

export const CANONICAL_THRESHOLDS: QualityThresholds = {
  minVideoWidth: 1080,
  minVideoHeight: 1920,
  expectedAspectRatio: "9:16",
  minDurationSeconds: 1.5,
  maxDurationSeconds: 65,
  minAudioBytes: 1000,
  minVideoBytes: 5000,
  minVerificationScore: 70,
  requireH264: true,
  requireAAC: true,
  requireDecodeSmoke: true,
};
