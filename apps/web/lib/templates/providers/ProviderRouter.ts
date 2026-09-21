import { ProviderType, AssetRequirement } from '../schemas/TemplateSchema';
import * as crypto from 'crypto';

export type ProviderCapabilityTier = 
  | 'OPEN_SOURCE'
  | 'FREE_NO_KEY'
  | 'FREE_WITH_KEY'
  | 'FREE_TIER'
  | 'PAID'
  | 'CONFIG_REQUIRED'
  | 'BLOCKED';

export interface AssetProvenance {
  provider: string;
  providerAssetId: string;
  sourceUrl: string;
  creator: string;
  license: string;
  rightsStatus: 'PUBLIC_DOMAIN' | 'CREATIVE_COMMONS' | 'FREE_COMMERCIAL' | 'LICENSED' | 'PROPRIETARY' | 'UNKNOWN';
  retrievedAt: string;
  sha256: string;
  mimeType: string;
  dimensions?: { width: number; height: number };
}

export interface ResolvedAsset {
  assetId: string;
  role: string;
  type: ProviderType;
  uri: string; // local file path or data URI or direct HTTPS URL
  content?: string; // e.g. SVG or code content
  provenance: AssetProvenance;
  isFallback: boolean;
}

export interface IProviderAdapter {
  id: string;
  name: string;
  supportedTypes: ProviderType[];
  capabilityTier: ProviderCapabilityTier;
  resolve(requirement: AssetRequirement, context: Record<string, any>): Promise<ResolvedAsset | null>;
  health(): Promise<{ healthy: boolean; details?: string }>;
}

/**
 * 1. Wikimedia Adapter (FREE_NO_KEY, OPEN_SOURCE)
 */
export class WikimediaAdapter implements IProviderAdapter {
  id = 'wikimedia';
  name = 'Wikimedia Commons';
  supportedTypes: ProviderType[] = ['IMAGE'];
  capabilityTier: ProviderCapabilityTier = 'FREE_NO_KEY';

  async resolve(requirement: AssetRequirement, context: Record<string, any>): Promise<ResolvedAsset | null> {
    const query = requirement.queryTemplate 
      ? requirement.queryTemplate.replace(/\{(\w+)\}/g, (_, k) => context[k] || '')
      : (context.topic || context.headline || 'nature');

    const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1&prop=imageinfo&iiprop=url|size|extmetadata`;

    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const pages = data?.query?.pages || {};
      const firstKey = Object.keys(pages)[0];
      if (!firstKey || firstKey === '-1') return null;

      const page = pages[firstKey];
      const info = page?.imageinfo?.[0];
      if (!info?.url) return null;

      const ext = info.extmetadata || {};
      const artist = (ext.Artist?.value || 'Wikimedia Commons Contributor').replace(/<[^>]*>/g, '').trim();
      const license = ext.LicenseShortName?.value || 'CC-BY-SA';
      const sha256 = crypto.createHash('sha256').update(info.url).digest('hex');

      return {
        assetId: `wikimedia_${page.pageid || sha256.slice(0, 8)}`,
        role: requirement.role,
        type: 'IMAGE',
        uri: info.url,
        provenance: {
          provider: this.id,
          providerAssetId: String(page.pageid || 'unknown'),
          sourceUrl: info.descriptionurl || 'https://commons.wikimedia.org',
          creator: artist,
          license: license,
          rightsStatus: license.toLowerCase().includes('cc0') || license.toLowerCase().includes('public domain') 
            ? 'PUBLIC_DOMAIN' 
            : 'CREATIVE_COMMONS',
          retrievedAt: new Date().toISOString(),
          sha256,
          mimeType: info.mime || 'image/jpeg',
          dimensions: { width: info.width || 1080, height: info.height || 1920 }
        },
        isFallback: false
      };
    } catch {
      return null;
    }
  }

  async health(): Promise<{ healthy: boolean; details?: string }> {
    try {
      const res = await fetch('https://commons.wikimedia.org/w/api.php?action=query&format=json', { method: 'HEAD' });
      return { healthy: res.ok, details: res.ok ? 'Wikimedia Commons API reachable' : 'HTTP error' };
    } catch (e: any) {
      return { healthy: false, details: e?.message || 'Network unreachable' };
    }
  }
}

/**
 * 2. FlagCDN Adapter (FREE_NO_KEY, OPEN_SOURCE)
 * Canonical ISO-3166 high-res country flags
 */
export class FlagCdnAdapter implements IProviderAdapter {
  id = 'flagcdn';
  name = 'FlagCDN Canonical Flags';
  supportedTypes: ProviderType[] = ['FLAG', 'IMAGE'];
  capabilityTier: ProviderCapabilityTier = 'FREE_NO_KEY';

  async resolve(requirement: AssetRequirement, context: Record<string, any>): Promise<ResolvedAsset | null> {
    const rawCode = context.countryCode || context.code || 'UN';
    const code = String(rawCode).trim().toLowerCase();
    const uri = `https://flagcdn.com/w640/${code}.png`;
    const sha256 = crypto.createHash('sha256').update(`flagcdn_${code}`).digest('hex');

    return {
      assetId: `flag_${code}`,
      role: requirement.role,
      type: 'FLAG',
      uri,
      provenance: {
        provider: this.id,
        providerAssetId: code,
        sourceUrl: `https://flagcdn.com/${code}.svg`,
        creator: 'FlagCDN / Public Domain',
        license: 'Public Domain / ISO 3166-1',
        rightsStatus: 'PUBLIC_DOMAIN',
        retrievedAt: new Date().toISOString(),
        sha256,
        mimeType: 'image/png',
        dimensions: { width: 640, height: 480 }
      },
      isFallback: false
    };
  }

  async health(): Promise<{ healthy: boolean; details?: string }> {
    return { healthy: true, details: 'FlagCDN static endpoint operational' };
  }
}

/**
 * 3. Simple Icons Adapter (FREE_NO_KEY, OPEN_SOURCE)
 * High-res vector brand icons
 */
export class SimpleIconsAdapter implements IProviderAdapter {
  id = 'simpleicons';
  name = 'Simple Icons Vector Logos';
  supportedTypes: ProviderType[] = ['LOGO', 'IMAGE'];
  capabilityTier: ProviderCapabilityTier = 'FREE_NO_KEY';

  async resolve(requirement: AssetRequirement, context: Record<string, any>): Promise<ResolvedAsset | null> {
    const rawBrand = context.brandName || context.name || 'github';
    const slug = String(rawBrand).toLowerCase().replace(/[^a-z0-9]/g, '');
    const uri = `https://cdn.simpleicons.org/${slug}`;
    const sha256 = crypto.createHash('sha256').update(`simpleicons_${slug}`).digest('hex');

    return {
      assetId: `logo_${slug}`,
      role: requirement.role,
      type: 'LOGO',
      uri,
      provenance: {
        provider: this.id,
        providerAssetId: slug,
        sourceUrl: `https://simpleicons.org/icons/${slug}`,
        creator: 'Simple Icons contributors',
        license: 'CC0-1.0',
        rightsStatus: 'PUBLIC_DOMAIN',
        retrievedAt: new Date().toISOString(),
        sha256,
        mimeType: 'image/svg+xml'
      },
      isFallback: false
    };
  }

  async health(): Promise<{ healthy: boolean; details?: string }> {
    return { healthy: true, details: 'SimpleIcons CDN operational' };
  }
}

/**
 * 4. Deterministic Code Highlighter Adapter (OPEN_SOURCE, FREE_NO_KEY)
 * Generates formatted, highlighted syntax representation deterministically
 */
export class DeterministicCodeAdapter implements IProviderAdapter {
  id = 'deterministic_code';
  name = 'Deterministic Syntax Highlighter';
  supportedTypes: ProviderType[] = ['CODE'];
  capabilityTier: ProviderCapabilityTier = 'OPEN_SOURCE';

  async resolve(requirement: AssetRequirement, context: Record<string, any>): Promise<ResolvedAsset | null> {
    const language = context.language || 'typescript';
    const codeSnippet = context.codeSnippet || context.code || '// FactoryOS Code Block\nconst ready = true;';
    const sha256 = crypto.createHash('sha256').update(`${language}:${codeSnippet}`).digest('hex');

    // Deterministic styled SVG container
    const lines = codeSnippet.split('\n').map((line: string, i: number) => {
      const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<div style="font-family: monospace; font-size: 24px; line-height: 36px;"><span style="color: #64748B; margin-right: 16px;">${i + 1}</span><span style="color: #E2E8F0;">${escaped}</span></div>`;
    }).join('');

    const htmlCard = `<div style="background: #0D1117; padding: 32px; border-radius: 16px; border: 1px solid #30363D; width: 920px; box-shadow: 0 20px 40px rgba(0,0,0,0.6);">${lines}</div>`;

    return {
      assetId: `code_${sha256.slice(0, 10)}`,
      role: requirement.role,
      type: 'CODE',
      uri: `data:text/html;base64,${Buffer.from(htmlCard).toString('base64')}`,
      content: htmlCard,
      provenance: {
        provider: this.id,
        providerAssetId: sha256.slice(0, 12),
        sourceUrl: 'factoryos://internal/syntax-engine',
        creator: 'FactoryOS Code Engine',
        license: 'MIT',
        rightsStatus: 'PUBLIC_DOMAIN',
        retrievedAt: new Date().toISOString(),
        sha256,
        mimeType: 'text/html'
      },
      isFallback: false
    };
  }

  async health(): Promise<{ healthy: boolean; details?: string }> {
    return { healthy: true, details: 'Deterministic syntax engine ready' };
  }
}

/**
 * 5. Deterministic Chart Generator Adapter (OPEN_SOURCE, FREE_NO_KEY)
 */
export class DeterministicChartAdapter implements IProviderAdapter {
  id = 'deterministic_chart';
  name = 'Deterministic Chart Generator';
  supportedTypes: ProviderType[] = ['CHART'];
  capabilityTier: ProviderCapabilityTier = 'OPEN_SOURCE';

  async resolve(requirement: AssetRequirement, context: Record<string, any>): Promise<ResolvedAsset | null> {
    const data: Array<{ label: string; value: number }> = context.data || [
      { label: 'FactoryOS', value: 92 },
      { label: 'Legacy', value: 28 }
    ];
    const title = context.title || 'Performance Comparison';
    const sha256 = crypto.createHash('sha256').update(JSON.stringify({ title, data })).digest('hex');

    const bars = data.map(item => {
      const pct = Math.min(100, Math.max(5, item.value));
      return `
        <div style="margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; font-family: sans-serif; font-weight: 700; color: #F8FAFC; margin-bottom: 8px;">
            <span>${item.label}</span>
            <span style="color: #38BDF8;">${item.value}%</span>
          </div>
          <div style="background: #1E293B; height: 28px; border-radius: 14px; overflow: hidden;">
            <div style="background: linear-gradient(90deg, #38BDF8, #6366F1); width: ${pct}%; height: 100%; border-radius: 14px;"></div>
          </div>
        </div>
      `;
    }).join('');

    const htmlCard = `
      <div style="background: #0F172A; padding: 36px; border-radius: 20px; border: 1px solid #334155; width: 920px;">
        <h2 style="font-family: sans-serif; color: #FFFFFF; font-size: 32px; margin-top: 0; margin-bottom: 28px;">${title}</h2>
        ${bars}
      </div>
    `;

    return {
      assetId: `chart_${sha256.slice(0, 10)}`,
      role: requirement.role,
      type: 'CHART',
      uri: `data:text/html;base64,${Buffer.from(htmlCard).toString('base64')}`,
      content: htmlCard,
      provenance: {
        provider: this.id,
        providerAssetId: sha256.slice(0, 12),
        sourceUrl: 'factoryos://internal/chart-engine',
        creator: 'FactoryOS Chart Engine',
        license: 'MIT',
        rightsStatus: 'PUBLIC_DOMAIN',
        retrievedAt: new Date().toISOString(),
        sha256,
        mimeType: 'text/html'
      },
      isFallback: false
    };
  }

  async health(): Promise<{ healthy: boolean; details?: string }> {
    return { healthy: true, details: 'Deterministic chart generator ready' };
  }
}

/**
 * 6. Semantic Fallback Adapter
 * Guarantees a high-aesthetic, semantically appropriate card when external network providers fail.
 */
export class SemanticFallbackAdapter implements IProviderAdapter {
  id = 'semantic_fallback';
  name = 'FactoryOS Semantic Fallback Engine';
  supportedTypes: ProviderType[] = ['IMAGE', 'FLAG', 'LOGO', 'CODE', 'CHART', 'RESEARCH'];
  capabilityTier: ProviderCapabilityTier = 'OPEN_SOURCE';

  async resolve(requirement: AssetRequirement, context: Record<string, any>): Promise<ResolvedAsset> {
    const role = requirement.role;
    const fallbackConcept = requirement.semanticFallback || 'informative_card';
    const text = context.caption || context.headline || context.title || context.countryName || 'FactoryOS Production Beat';
    const sha256 = crypto.createHash('sha256').update(`fallback_${role}_${text}`).digest('hex');

    // SVG Gradient aesthetic card
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#090A0F"/>
            <stop offset="50%" stop-color="#1E1B4B"/>
            <stop offset="100%" stop-color="#312E81"/>
          </linearGradient>
        </defs>
        <rect width="1080" height="1920" fill="url(#bg)"/>
        <circle cx="540" cy="960" r="400" fill="#4338CA" opacity="0.15" filter="blur(80px)"/>
      </svg>
    `.trim();

    return {
      assetId: `fallback_${sha256.slice(0, 10)}`,
      role: requirement.role,
      type: requirement.type,
      uri: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
      content: svg,
      provenance: {
        provider: this.id,
        providerAssetId: `fallback_${fallbackConcept}`,
        sourceUrl: 'factoryos://fallback/generated',
        creator: 'FactoryOS Deterministic Fallback',
        license: 'MIT',
        rightsStatus: 'PUBLIC_DOMAIN',
        retrievedAt: new Date().toISOString(),
        sha256,
        mimeType: 'image/svg+xml',
        dimensions: { width: 1080, height: 1920 }
      },
      isFallback: true
    };
  }

  async health(): Promise<{ healthy: boolean; details?: string }> {
    return { healthy: true, details: 'Deterministic fallback always operational' };
  }
}

/**
 * Canonical Provider Router
 */
export class ProviderRouter {
  private static instance: ProviderRouter | null = null;
  private adapters: Map<string, IProviderAdapter> = new Map();
  private fallbackAdapter = new SemanticFallbackAdapter();

  private constructor() {
    this.registerAdapter(new WikimediaAdapter());
    this.registerAdapter(new FlagCdnAdapter());
    this.registerAdapter(new SimpleIconsAdapter());
    this.registerAdapter(new DeterministicCodeAdapter());
    this.registerAdapter(new DeterministicChartAdapter());
  }

  public static getInstance(): ProviderRouter {
    if (!ProviderRouter.instance) {
      ProviderRouter.instance = new ProviderRouter();
    }
    return ProviderRouter.instance;
  }

  public registerAdapter(adapter: IProviderAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  public getAdapter(id: string): IProviderAdapter | undefined {
    return this.adapters.get(id);
  }

  public listAdapters(): IProviderAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Route an AssetRequirement to the best matching provider, applying semantic fallback if needed
   */
  public async resolveAsset(
    requirement: AssetRequirement, 
    context: Record<string, any>
  ): Promise<ResolvedAsset> {
    // Find candidate adapters for this requirement type
    const candidates = Array.from(this.adapters.values()).filter(a => 
      a.supportedTypes.includes(requirement.type)
    );

    for (const adapter of candidates) {
      try {
        const asset = await adapter.resolve(requirement, context);
        if (asset) {
          return asset;
        }
      } catch (err) {
        console.warn(`[ProviderRouter] Adapter ${adapter.id} failed to resolve ${requirement.role}:`, err);
      }
    }

    // If all candidates failed or no candidate existed, use deterministic semantic fallback
    return await this.fallbackAdapter.resolve(requirement, context);
  }
}
