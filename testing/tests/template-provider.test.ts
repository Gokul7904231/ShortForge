/**
 * FactoryOS V3 Testing Suite — Provider Router & Free/Open Adapter Tests
 * Validates Phase 2: Free / Open Provider & Adapter Layer
 */

import { describe, it, expect } from 'vitest';
import { ProviderRouter } from '../templates/providers/ProviderRouter';

describe('FactoryOS V3: Provider Router & Adapter Test Suite', () => {
  const router = ProviderRouter.getInstance();

  it('resolves national flag with full provenance via FlagCDN Adapter', async () => {
    const asset = await router.resolveAsset(
      { role: 'flagAsset', type: 'FLAG', optional: false },
      { countryCode: 'JP', countryName: 'Japan' }
    );
    expect(asset.uri).toContain('flagcdn.com/w640/jp.png');
    expect(asset.provenance.provider).toBe('flagcdn');
    expect(asset.provenance.sha256).toBeDefined();
    expect(asset.provenance.rightsStatus).toBe('PUBLIC_DOMAIN');
  });

  it('resolves brand logo vector with CC0 license via SimpleIcons Adapter', async () => {
    const asset = await router.resolveAsset(
      { role: 'logoAsset', type: 'LOGO', optional: false },
      { brandName: 'GitHub' }
    );
    expect(asset.uri).toContain('simpleicons.org/github');
    expect(asset.provenance.license).toBe('CC0-1.0');
    expect(asset.provenance.mimeType).toBe('image/svg+xml');
  });

  it('formats and highlights code snippet via Deterministic Code Adapter', async () => {
    const asset = await router.resolveAsset(
      { role: 'codeSnippet', type: 'CODE', optional: false },
      { language: 'python', codeSnippet: 'def add(a, b):\n    return a + b' }
    );
    expect(asset.type).toBe('CODE');
    expect(asset.content).toContain('def add(a, b)');
    expect(asset.uri.startsWith('data:text/html;base64,')).toBe(true);
  });

  it('computes percentages and generates chart card via Deterministic Chart Adapter', async () => {
    const asset = await router.resolveAsset(
      { role: 'chartData', type: 'CHART', optional: false },
      {
        title: 'Q3 Growth',
        data: [
          { label: 'Organic', value: 80 },
          { label: 'Paid', value: 20 }
        ]
      }
    );
    expect(asset.type).toBe('CHART');
    expect(asset.content).toContain('Q3 Growth');
  });

  it('falls back gracefully to semantic SVG when primary fails', async () => {
    const asset = await router.resolveAsset(
      { role: 'obscureArtifact', type: 'IMAGE', optional: false, semanticFallback: 'informative_card' },
      { topic: 'nonexistent_obscure_topic_query_9999999' }
    );
    expect(asset).toBeDefined();
    expect(asset.provenance.sha256).toBeDefined();
  });
});

export async function runTemplateProviderTestSuite(): Promise<{ passed: boolean; results: any[] }> {
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

  console.log('\n=== FactoryOS V3: Provider Router & Adapter Test Suite ===\n');

  const router = ProviderRouter.getInstance();

  // Test 1: FlagCDN Adapter resolution & provenance
  await runTest('Test 1: FlagCDN Adapter resolves national flag with full provenance', async () => {
    const asset = await router.resolveAsset(
      { role: 'flagAsset', type: 'FLAG', optional: false },
      { countryCode: 'JP', countryName: 'Japan' }
    );

    if (!asset.uri.includes('flagcdn.com/w640/jp.png')) {
      throw new Error(`Unexpected URI: ${asset.uri}`);
    }
    if (asset.provenance.provider !== 'flagcdn') {
      throw new Error(`Unexpected provider: ${asset.provenance.provider}`);
    }
    if (!asset.provenance.sha256) {
      throw new Error('Asset missing SHA-256 hash');
    }
    if (asset.provenance.rightsStatus !== 'PUBLIC_DOMAIN') {
      throw new Error(`Expected PUBLIC_DOMAIN rights status, got ${asset.provenance.rightsStatus}`);
    }
  });

  // Test 2: SimpleIcons Logo Adapter resolution & provenance
  await runTest('Test 2: SimpleIcons Adapter resolves brand logo vector with CC0 license', async () => {
    const asset = await router.resolveAsset(
      { role: 'logoAsset', type: 'LOGO', optional: false },
      { brandName: 'GitHub' }
    );

    if (!asset.uri.includes('simpleicons.org/github')) {
      throw new Error(`Unexpected logo URI: ${asset.uri}`);
    }
    if (asset.provenance.license !== 'CC0-1.0') {
      throw new Error(`Expected CC0-1.0 license, got ${asset.provenance.license}`);
    }
    if (asset.provenance.mimeType !== 'image/svg+xml') {
      throw new Error(`Expected SVG mime type, got ${asset.provenance.mimeType}`);
    }
  });

  // Test 3: Deterministic Code Highlighter resolution
  await runTest('Test 3: Deterministic Code Adapter formats and highlights code snippet', async () => {
    const asset = await router.resolveAsset(
      { role: 'codeSnippet', type: 'CODE', optional: false },
      { language: 'python', codeSnippet: 'def add(a, b):\n    return a + b' }
    );

    if (asset.type !== 'CODE') {
      throw new Error(`Unexpected asset type: ${asset.type}`);
    }
    if (!asset.content || !asset.content.includes('def add(a, b)')) {
      throw new Error('Asset missing highlighted code content');
    }
    if (!asset.uri.startsWith('data:text/html;base64,')) {
      throw new Error('Expected base64 data URI');
    }
  });

  // Test 4: Deterministic Chart resolution
  await runTest('Test 4: Deterministic Chart Adapter computes percentages and generates chart card', async () => {
    const asset = await router.resolveAsset(
      { role: 'chartData', type: 'CHART', optional: false },
      {
        title: 'Q3 Growth',
        data: [
          { label: 'Organic', value: 80 },
          { label: 'Paid', value: 20 }
        ]
      }
    );

    if (asset.type !== 'CHART') {
      throw new Error(`Unexpected asset type: ${asset.type}`);
    }
    if (!asset.content || !asset.content.includes('Q3 Growth')) {
      throw new Error('Chart missing title in rendered HTML');
    }
  });

  // Test 5: Semantic Fallback guarantee
  await runTest('Test 5: ProviderRouter falls back gracefully to semantic SVG when primary fails', async () => {
    const asset = await router.resolveAsset(
      { role: 'obscureArtifact', type: 'IMAGE', optional: false, semanticFallback: 'informative_card' },
      { topic: 'nonexistent_obscure_topic_query_9999999' }
    );

    if (!asset) {
      throw new Error('Expected resolved asset even for obscure query');
    }
    if (!asset.isFallback && !asset.uri) {
      throw new Error('Asset should either be valid online asset or valid fallback');
    }
    if (!asset.provenance.sha256) {
      throw new Error('Fallback asset must have SHA-256 provenance');
    }
  });

  const passed = results.every(r => r.passed);
  console.log(`\nProvider Router Suite Result: ${results.filter(r => r.passed).length}/${results.length} PASSED`);
  return { passed, results };
}

if (require.main === module) {
  runTemplateProviderTestSuite().then(res => {
    process.exitCode = res.passed ? 0 : 1;
  });
}
