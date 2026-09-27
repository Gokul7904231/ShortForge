import type { TTSTimingCapabilities } from "../templates/temporal/TemporalContracts";

export interface VoiceProvider {
  id: string;
  name: string;
  version: string;
  supportsStreaming: boolean;
  supportsSSML: boolean;
  supportsEmotion: boolean;
  supportsVoiceCloning: boolean;
  supportsLanguages: string[];
  timingCapabilities?: TTSTimingCapabilities;
  health(): Promise<{ online: boolean; latencyMs: number; error?: string; cpu?: number; memory?: number }>;
  benchmark(): Promise<{ latencyMs: number; coldStartMs: number; warmStartMs: number; wordsPerSec: number; rtf: number }>;
  synthesize(text: string, options: {
    voiceId: string;
    modelId?: string;
    speed?: number;
    language?: string;
    emotion?: string;
    style?: string;
    format?: string;
    sampleRate?: number;
  }): Promise<Buffer>;
}
export default VoiceProvider;
