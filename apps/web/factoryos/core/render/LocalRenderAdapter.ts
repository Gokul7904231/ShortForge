/**
 * FactoryOS V3 Local Render Adapter (Node/TypeScript)
 * Dispatches RenderIntent payloads to the standalone factoryos-render Python engine
 * via direct JSON stdin/stdout protocol with zero shell interpolation.
 */

import { spawn, ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';

export interface LocalRenderOutputSettings {
  width?: number;
  height?: number;
  fps?: number;
  video_codec?: string;
  audio_codec?: string;
}

export interface LocalRenderShotIntent {
  id: string;
  recipe_id: string;
  start_seconds: float;
  duration_seconds: float;
  props?: Record<string, any>;
  motion?: Record<string, any>;
  assets?: any[];
}

export interface LocalRenderSceneIntent {
  scene_id: string;
  template_id: string;
  narration_text: string;
  duration_seconds: number;
  shots?: LocalRenderShotIntent[];
  audio_track?: {
    track_id: string;
    audio_path: string;
    start_seconds?: number;
    duration_seconds?: number;
    volume?: number;
  };
}

export interface LocalRenderIntent {
  project_id: string;
  title: string;
  output_path: string;
  scenes: LocalRenderSceneIntent[];
  output?: LocalRenderOutputSettings;
  safe_area?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  metadata?: Record<string, any>;
}

export interface RenderReceipt {
  run_id: string;
  renderer_version: string;
  intent_hash: string;
  composition_hash: string;
  output_path: string;
  output_sha256: string;
  width: number;
  height: number;
  fps: number;
  duration_seconds: number;
  total_frames: number;
  render_time_ms: number;
  render_mode: string;
  ffmpeg_version: string;
  cache_hits: number;
  cache_misses: number;
  scenes_rendered: string[];
  validation: {
    is_valid: boolean;
    file_exists: boolean;
    file_size_bytes: number;
    duration_seconds: number;
    width: number;
    height: number;
    has_video_stream: boolean;
    has_audio_stream: boolean;
    codec: string;
    errors: string[];
  };
}

export interface RendererHealth {
  installed: boolean;
  version?: string;
  pythonVersion?: string;
  ffmpegVersion?: string;
  pillowVersion?: string;
  allHealthy: boolean;
  details?: Record<string, any>;
}

type float = number;

export class LocalRenderAdapter {
  private static instance: LocalRenderAdapter | null = null;
  private pythonBin: string;
  private renderBin: string | null = null;

  private constructor() {
    this.pythonBin = process.env.FACTORYOS_RENDER_PYTHON || (os.platform() === 'win32' ? 'python' : 'python3');
    if (process.env.FACTORYOS_RENDER_BIN) {
      this.renderBin = process.env.FACTORYOS_RENDER_BIN;
    }
  }

  public static getInstance(): LocalRenderAdapter {
    if (!LocalRenderAdapter.instance) {
      LocalRenderAdapter.instance = new LocalRenderAdapter();
    }
    return LocalRenderAdapter.instance;
  }

  /**
   * Healthcheck using doctor command
   */
  public async healthCheck(): Promise<RendererHealth> {
    try {
      const response = await this.executeCommand<{ diagnostics: any }>('doctor', {});
      if (response && response.diagnostics) {
        const d = response.diagnostics;
        return {
          installed: true,
          version: d.rendererVersion,
          pythonVersion: d.pythonVersion,
          ffmpegVersion: d.checks?.ffmpeg?.version,
          pillowVersion: d.checks?.pillow?.version,
          allHealthy: d.allHealthy,
          details: d
        };
      }
      return { installed: false, allHealthy: false };
    } catch (err) {
      return { installed: false, allHealthy: false };
    }
  }

  /**
   * Render video from RenderIntent
   */
  public async render(
    intent: LocalRenderIntent,
    runId?: string,
    onProgress?: (progressMessage: string) => void
  ): Promise<RenderReceipt> {
    const response = await this.executeCommand<{ receipt: RenderReceipt }>('render', {
      renderIntent: intent,
      runId: runId || `node_${Date.now()}`
    }, onProgress);

    if (!response || !response.receipt) {
      throw new Error('Local renderer failed to produce a valid RenderReceipt');
    }

    return response.receipt;
  }

  /**
   * Core JSON protocol communication over stdin/stdout
   */
  private executeCommand<T = any>(
    command: string,
    payload: Record<string, any>,
    onProgress?: (msg: string) => void
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const requestPayload = {
        protocolVersion: '1.0',
        requestId,
        command,
        ...payload
      };

      const cmdArgs = this.renderBin 
        ? [this.renderBin, '--adapter']
        : [this.pythonBin, '-m', 'factoryos_render.cli', '--adapter'];

      const executable = cmdArgs[0];
      const args = cmdArgs.slice(1);

      // Dynamically locate packages/factoryos-render/src
      let searchDir = process.cwd();
      let renderSrcPath = "";
      for (let i = 0; i < 5; i++) {
        const candidate = path.join(searchDir, "packages", "factoryos-render", "src");
        if (fs.existsSync(candidate)) {
          renderSrcPath = candidate;
          break;
        }
        searchDir = path.dirname(searchDir);
      }

      const currentPythonPath = process.env.PYTHONPATH || "";
      const pythonPath = renderSrcPath
        ? currentPythonPath ? `${renderSrcPath}${path.delimiter}${currentPythonPath}` : renderSrcPath
        : currentPythonPath;

      const child: ChildProcess = spawn(executable, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONPATH: pythonPath,
        },
      });

      let stdoutData = '';
      let stderrData = '';

      child.stdout?.on('data', (chunk) => {
        stdoutData += chunk.toString();
      });

      child.stderr?.on('data', (chunk) => {
        const text = chunk.toString();
        stderrData += text;
        if (onProgress && text.includes('[RENDER_PROGRESS]')) {
          onProgress(text.trim());
        }
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to spawn factoryos-render: ${err.message}`));
      });

      child.on('close', (code) => {
        if (!stdoutData.trim()) {
          return reject(new Error(`factoryos-render exited with code ${code}. Stderr: ${stderrData}`));
        }

        try {
          const parsed = JSON.parse(stdoutData.trim());
          if (parsed.status === 'FAILED') {
            return reject(new Error(`Render failed [${parsed.error?.code}]: ${parsed.error?.message}`));
          }
          resolve(parsed as T);
        } catch (parseErr: any) {
          reject(new Error(`Failed to parse renderer output: ${stdoutData}. Stderr: ${stderrData}`));
        }
      });

      // Send payload over stdin and close
      child.stdin?.write(JSON.stringify(requestPayload));
      child.stdin?.end();
    });
  }
}
