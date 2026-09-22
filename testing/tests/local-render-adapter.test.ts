/**
 * FactoryOS V3 Testing Suite — Node <-> Python LocalRenderAdapter Contract Tests
 * Validates Phase 2.5: factoryos-render integration via LocalRenderAdapter.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { LocalRenderAdapter, LocalRenderIntent } from '../../apps/web/factoryos/core/render/LocalRenderAdapter';

export async function runLocalRenderAdapterTestSuite(): Promise<{ passed: boolean; results: any[] }> {
  const results: { name: string; passed: boolean; error?: string }[] = [];

  const runTest = async (name: string, fn: () => void | Promise<void>) => {
    try {
      await fn();
      results.push({ name, passed: true });
      console.log(`  [PASS] ${name}`);
    } catch (err: any) {
      results.push({ name, passed: false, error: err?.message || String(err) });
      console.error(`  [FAIL] ${name}: ${err?.message || String(err)}`);
    }
  };

  console.log('\n=== FactoryOS V3: LocalRenderAdapter (Node <-> Python) Test Suite ===\n');

  const adapter = LocalRenderAdapter.getInstance();

  // Test 1: Healthcheck contract
  await runTest('Test 1: LocalRenderAdapter healthCheck returns installed and operational', async () => {
    const health = await adapter.healthCheck();
    if (!health.installed) {
      throw new Error('Expected renderer to be installed');
    }
    if (!health.allHealthy) {
      throw new Error(`Renderer reported unhealthy state: ${JSON.stringify(health.details)}`);
    }
    if (!health.version || !health.version.startsWith('0.1')) {
      throw new Error(`Unexpected renderer version: ${health.version}`);
    }
  });

  // Test 2: Full Render Execution from TypeScript
  await runTest('Test 2: LocalRenderAdapter renders 3-scene 9:16 short to physical MP4', async () => {
    const outputPath = path.resolve('testing/artifacts/node_adapter_test_output.mp4');
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    const intent: LocalRenderIntent = {
      project_id: 'test_node_integration',
      title: 'Node Integration Test',
      output_path: outputPath,
      output: {
        width: 1080,
        height: 1920,
        fps: 30
      },
      safe_area: {
        top: 160,
        bottom: 320,
        left: 60,
        right: 120
      },
      scenes: [
        {
          scene_id: 'scene_hook',
          template_id: 'facts.rapid-facts.v1',
          narration_text: 'The speed of light is 300,000 kilometers per second.',
          duration_seconds: 2.0,
          shots: [
            {
              id: 's1',
              recipe_id: 'KINETIC_HOOK',
              start_seconds: 0.0,
              duration_seconds: 2.0,
              props: { headline: 'SPEED OF LIGHT', background_type: 'DEEP_INDIGO' }
            }
          ]
        },
        {
          scene_id: 'scene_stat',
          template_id: 'facts.rapid-facts.v1',
          narration_text: 'Nothing in the physical universe can travel faster.',
          duration_seconds: 2.0,
          shots: [
            {
              id: 's2',
              recipe_id: 'STAT',
              start_seconds: 0.0,
              duration_seconds: 2.0,
              props: { headline: 'UNIVERSAL SPEED LIMIT', value: '300,000 KM/S' }
            }
          ]
        },
        {
          scene_id: 'scene_outro',
          template_id: 'facts.rapid-facts.v1',
          narration_text: 'FactoryOS deterministic render test.',
          duration_seconds: 1.5,
          shots: [
            {
              id: 's3',
              recipe_id: 'OUTRO_CTA',
              start_seconds: 0.0,
              duration_seconds: 1.5,
              props: { headline: 'VERIFIED RENDER' }
            }
          ]
        }
      ]
    };

    const progressMessages: string[] = [];
    const receipt = await adapter.render(intent, 'run_node_test_01', (msg) => {
      progressMessages.push(msg);
    });

    if (!receipt) {
      throw new Error('Adapter returned null receipt');
    }
    if (!receipt.output_sha256) {
      throw new Error('Receipt missing output SHA-256');
    }
    if (receipt.width !== 1080 || receipt.height !== 1920) {
      throw new Error(`Unexpected dimensions: ${receipt.width}x${receipt.height}`);
    }
    if (receipt.duration_seconds < 5.0) {
      throw new Error(`Unexpected short duration: ${receipt.duration_seconds}s`);
    }

    // Verify physical file on disk
    if (!fs.existsSync(outputPath)) {
      throw new Error(`Physical output MP4 file does not exist at ${outputPath}`);
    }
    const stat = fs.statSync(outputPath);
    if (stat.size < 10000) {
      throw new Error(`Physical MP4 too small (${stat.size} bytes)`);
    }
  });

  // Test 3: Error handling for invalid payload
  await runTest('Test 3: LocalRenderAdapter handles and propagates render failure cleanly', async () => {
    let failedCleanly = false;
    try {
      await (adapter as any).executeCommand('render', {
        renderIntent: {
          project_id: 'bad_project',
          scenes: [] // Empty scenes must fail validation
        }
      });
    } catch (err: any) {
      failedCleanly = true;
    }

    if (!failedCleanly) {
      throw new Error('Expected render with empty scenes to fail cleanly');
    }
  });

  const passed = results.every(r => r.passed);
  console.log(`\nLocalRenderAdapter Suite Result: ${results.filter(r => r.passed).length}/${results.length} PASSED`);
  return { passed, results };
}

import { describe, it, expect } from 'vitest';

describe('FactoryOS V3: LocalRenderAdapter Suite', () => {
  it('executes and passes all LocalRenderAdapter contract tests', async () => {
    const res = await runLocalRenderAdapterTestSuite();
    expect(res.passed).toBe(true);
  }, 120000);
});

if (require.main === module) {
  runLocalRenderAdapterTestSuite().then(res => {
    process.exitCode = res.passed ? 0 : 1;
  });
}
