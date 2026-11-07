/**
 * Universal Asset Resolver for Quiz Content Engine (v1.2)
 * 
 * Provides deterministic, category-agnostic visual asset resolution across
 * Geography, Science, History, AI, and arbitrary user custom topics.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ResolvedAssetRecord {
  assetId: string;
  localPath: string;
  source: string;
  topic: string;
  width?: number;
  height?: number;
}

export class UniversalAssetResolver {
  private static findRepoRoot(): string {
    let curr = path.resolve(process.cwd());
    while (curr !== path.dirname(curr)) {
      if (fs.existsSync(path.join(curr, 'assets', 'quiz')) || fs.existsSync(path.join(curr, 'pnpm-workspace.yaml'))) {
        return curr;
      }
      curr = path.dirname(curr);
    }
    return path.resolve(process.cwd());
  }

  private static get repoRoot(): string {
    return this.findRepoRoot();
  }

  /**
   * Resolves a contextual photographic or diagrammatic asset for a quiz question.
   * Accepts explicit path, topic + question prompt, or concept keywords.
   */
  public static resolveQuestionAsset(params: {
    explicitPath?: string;
    topic: string;
    questionText: string;
    answerText: string;
  }): ResolvedAssetRecord {
    const { explicitPath, topic, questionText, answerText } = params;

    // 1. Direct explicit path resolution
    if (explicitPath) {
      const cleanPath = explicitPath.replace(/^file:\/\//, '');
      const absPath = path.isAbsolute(cleanPath)
        ? cleanPath
        : path.resolve(this.repoRoot, cleanPath);

      if (fs.existsSync(absPath)) {
        return {
          assetId: path.basename(absPath, path.extname(absPath)),
          localPath: absPath,
          source: 'explicit_path',
          topic
        };
      }
    }

    // 2. Keyword & Concept Matching against canonical assets/quiz/
    const query = `${topic} ${questionText} ${answerText}`.toLowerCase();
    const quizAssetsDir = path.resolve(this.repoRoot, 'assets', 'quiz');

    const conceptMappings: Array<{ keywords: string[]; relativePath: string; altPath?: string }> = [
      // Geography
      { keywords: ['mariana', 'trench', 'deepest', 'ocean', 'trench'], relativePath: 'geography/mariana_trench.png' },
      { keywords: ['lake', 'freshwater', 'canada', 'lakes'], relativePath: 'geography/freshwater_lakes.png' },
      { keywords: ['everest', 'mountain', 'himalayas', 'peak', 'elevation'], relativePath: 'geography/mount_everest_himalayas.png' },
      { keywords: ['amazon', 'rainforest', 'river', 'basin', 'jungle'], relativePath: 'geography/amazon_rainforest_basin.png' },
      { keywords: ['sahara', 'desert', 'dunes', 'sand', 'hot desert'], relativePath: 'geography/sahara_desert_dunes.png' },
      { keywords: ['tokyo', 'population', 'metro', 'city', 'megacity'], relativePath: 'geography/tokyo_megacity_urban.png' },

      // Science & Space (supporting both science/ and solar-system/ directories)
      { keywords: ['jupiter', 'shortest day', 'rotation', 'fastest spinning', 'hours'], relativePath: 'science/jupiter_rotation.png', altPath: 'solar-system/jupiter_rotation.png' },
      { keywords: ['light', 'speed of light', '300,000', 'speed limit', 'vacuum speed'], relativePath: 'science/speed_of_light.png', altPath: 'solar-system/speed_of_light.png' },
      { keywords: ['ganymede', 'largest moon', 'moon of jupiter'], relativePath: 'science/ganymede_internal_ocean.png', altPath: 'solar-system/ganymede_internal_ocean.png' },
      { keywords: ['vacuum', 'sound', 'silent', 'medium', 'acoustic'], relativePath: 'science/vacuum_sound_wave.png', altPath: 'solar-system/vacuum_sound_wave.png' },
      { keywords: ['venus', 'hottest', '460', 'greenhouse', 'runaway'], relativePath: 'science/venus_atmosphere_diagram.png', altPath: 'solar-system/venus_atmosphere_diagram.png' },
      { keywords: ['dna', 'double helix', 'genetic', 'molecular', 'genes'], relativePath: 'science/dna_double_helix_structure.png' },

      // History
      { keywords: ['apollo', 'moon', 'landing', '1969', 'armstrong'], relativePath: 'history/apollo_11_lunar.png' },
      { keywords: ['pyramid', 'giza', 'ancient', 'pharaoh', 'khufu'], relativePath: 'history/pyramid_giza.png' },

      // AI & Technology
      { keywords: ['transformer', 'attention', 'neural', 'llm', 'deep learning'], relativePath: 'ai/transformer_attention.png' },
      { keywords: ['gpu', 'silicon', 'die', 'microchip', 'cuda', 'hardware'], relativePath: 'ai/gpu_architecture.png' },
    ];

    for (const mapping of conceptMappings) {
      if (mapping.keywords.some((k) => query.includes(k))) {
        let candidate = path.resolve(quizAssetsDir, mapping.relativePath);
        if (!fs.existsSync(candidate) && mapping.altPath) {
          candidate = path.resolve(quizAssetsDir, mapping.altPath);
        }
        if (fs.existsSync(candidate)) {
          return {
            assetId: path.basename(candidate, path.extname(candidate)),
            localPath: candidate,
            source: 'canonical_concept_match',
            topic
          };
        }
      }
    }

    // 3. Category Background fallback if available
    const backgroundDir = path.resolve(this.repoRoot, 'assets', 'backgrounds');
    if (query.includes('geo') || query.includes('earth') || query.includes('map')) {
      const geoBg = path.resolve(backgroundDir, 'geography_theme.png');
      if (fs.existsSync(geoBg)) {
        return { assetId: 'geography_theme', localPath: geoBg, source: 'category_background', topic };
      }
    } else if (query.includes('science') || query.includes('physics') || query.includes('space')) {
      const sciBg = path.resolve(backgroundDir, 'science_theme.png');
      if (fs.existsSync(sciBg)) {
        return { assetId: 'science_theme', localPath: sciBg, source: 'category_background', topic };
      }
    }

    // 4. Fallback to world theme (explicitly recorded)
    const worldBg = path.resolve(backgroundDir, 'world_theme.png');
    if (fs.existsSync(worldBg)) {
      return { assetId: 'world_theme', localPath: worldBg, source: 'generic_theme_fallback', topic };
    }

    throw new Error(
      `[UniversalAssetResolver:MissingAssetError] Unable to resolve authentic visual asset for query: "${query}". No mock or silent fallback permitted.`
    );
  }
}

