/**
 * FactoryOS V3 Testing Suite — Template & Shot Recipe Library Tests
 * Validates Phase 1: Canonical Template & Shot Library
 */

import { describe, it, expect } from 'vitest';
import { TemplateRegistry } from '../templates/registry/TemplateRegistry';
import { SHOT_RECIPES } from '../templates/shots/ShotRecipeLibrary';
import { ShotRecipeContractSchema, TemplateDefinitionSchema, ShotRecipeId } from '../templates/schemas/TemplateSchema';
import { CANONICAL_TEMPLATES } from '../templates/definitions/CanonicalTemplates';

describe('FactoryOS V3: Template & Shot Library Test Suite', () => {
  it('validates all 24 shot recipes match ShotRecipeContractSchema and have 9:16 safe area', () => {
    const keys = Object.keys(SHOT_RECIPES) as ShotRecipeId[];
    expect(keys.length).toBeGreaterThanOrEqual(24);

    for (const key of keys) {
      const recipe = SHOT_RECIPES[key];
      const parsed = ShotRecipeContractSchema.safeParse(recipe);
      expect(parsed.success).toBe(true);
      expect(recipe.layout.aspect).toBe('9:16');
      expect(recipe.layout.safeArea.top).toBeGreaterThan(0);
      expect(recipe.layout.safeArea.bottom).toBeGreaterThan(0);
    }
  });

  it('validates all 12 canonical templates conform to TemplateDefinitionSchema', () => {
    expect(CANONICAL_TEMPLATES.length).toBeGreaterThanOrEqual(12);

    for (const tpl of CANONICAL_TEMPLATES) {
      const parsed = TemplateDefinitionSchema.safeParse(tpl);
      expect(parsed.success).toBe(true);
      expect(tpl.storyStructure.length).toBeGreaterThan(0);

      for (const step of tpl.storyStructure) {
        expect(SHOT_RECIPES[step.shotRecipeId]).toBeDefined();
      }
    }
  });

  it('registers canonical templates and supports ID lookup in TemplateRegistry', () => {
    const registry = TemplateRegistry.getInstance();
    const tpl = registry.getTemplate('facts.rapid-facts.v1');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('FACTS');

    const recipe = registry.getShotRecipe('KINETIC_HOOK');
    expect(recipe).toBeDefined();
    expect(recipe?.name).toBe('Kinetic Hook');
  });

  it('filters templates accurately by category, capabilityStatus, and search', () => {
    const registry = TemplateRegistry.getInstance();

    const historyTemplates = registry.listTemplates({ category: 'HISTORY' });
    expect(historyTemplates.length).toBeGreaterThan(0);
    expect(historyTemplates.every(t => t.category === 'HISTORY')).toBe(true);

    const readyTemplates = registry.listTemplates({ capabilityStatus: 'READY' });
    expect(readyTemplates.length).toBeGreaterThan(0);
    expect(readyTemplates.every(t => t.capabilityStatus === 'READY')).toBe(true);

    const searchResults = registry.listTemplates({ search: 'horror' });
    expect(searchResults.length).toBeGreaterThan(0);
    expect(searchResults.some(t => t.identity.id === 'story.micro-horror.v1')).toBe(true);
  });

  it('migrates legacy prompt-only templates into valid TemplateDefinitions', () => {
    const registry = TemplateRegistry.getInstance();
    const legacy = {
      id: 'legacy-quantum-paradox',
      name: 'Quantum Paradox Generator',
      description: 'Legacy prompt based generator',
      category: 'QUANTUM_TRIVIA',
      promptSeed: 'Explain quantum paradoxes simply'
    };

    const migrated = registry.migrateLegacyTemplate(legacy);
    const parsed = TemplateDefinitionSchema.safeParse(migrated);
    expect(parsed.success).toBe(true);
    expect(migrated.identity.id).toBe('migrated.legacy-quantum-paradox');
    expect(migrated.category).toBe('QUANTUM_TRIVIA');
    expect(migrated.capabilityStatus).toBe('BETA');
  });

  it('resolves fallback shot recipes to existing valid recipes', () => {
    for (const recipe of Object.values(SHOT_RECIPES)) {
      if (recipe.fallbackRecipeId) {
        const fallback = SHOT_RECIPES[recipe.fallbackRecipeId];
        expect(fallback).toBeDefined();
      }
    }
  });
});

export async function runTemplateLibraryTestSuite(): Promise<{ passed: boolean; results: any[] }> {
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

  console.log('\n=== FactoryOS V3: Template & Shot Library Test Suite ===\n');

  // Test 1: Validate all 24 Shot Recipes against schema
  await runTest('Test 1: All 24 shot recipes match ShotRecipeContractSchema and have 9:16 safe area', () => {
    const keys = Object.keys(SHOT_RECIPES) as ShotRecipeId[];
    if (keys.length < 24) {
      throw new Error(`Expected at least 24 shot recipes, found ${keys.length}`);
    }

    for (const key of keys) {
      const recipe = SHOT_RECIPES[key];
      const parsed = ShotRecipeContractSchema.safeParse(recipe);
      if (!parsed.success) {
        throw new Error(`Shot recipe ${key} failed schema validation: ${parsed.error.message}`);
      }
      if (recipe.layout.aspect !== '9:16') {
        throw new Error(`Shot recipe ${key} layout aspect is not 9:16`);
      }
      if (recipe.layout.safeArea.top <= 0 || recipe.layout.safeArea.bottom <= 0) {
        throw new Error(`Shot recipe ${key} safe area top/bottom must be positive`);
      }
    }
  });

  // Test 2: Validate all 12 Canonical Templates against schema
  await runTest('Test 2: All 12 canonical templates conform to TemplateDefinitionSchema', () => {
    if (CANONICAL_TEMPLATES.length < 12) {
      throw new Error(`Expected at least 12 canonical templates, found ${CANONICAL_TEMPLATES.length}`);
    }

    for (const tpl of CANONICAL_TEMPLATES) {
      const parsed = TemplateDefinitionSchema.safeParse(tpl);
      if (!parsed.success) {
        throw new Error(`Template ${tpl.identity.id} failed validation: ${parsed.error.message}`);
      }
      if (tpl.storyStructure.length === 0) {
        throw new Error(`Template ${tpl.identity.id} has empty storyStructure`);
      }
      // Ensure all referenced shot recipe IDs exist in the library
      for (const step of tpl.storyStructure) {
        if (!SHOT_RECIPES[step.shotRecipeId]) {
          throw new Error(`Template ${tpl.identity.id} references non-existent shotRecipeId '${step.shotRecipeId}'`);
        }
      }
    }
  });

  // Test 3: TemplateRegistry singleton initialization and lookup
  await runTest('Test 3: TemplateRegistry registers canonical templates and supports ID lookup', () => {
    const registry = TemplateRegistry.getInstance();
    const tpl = registry.getTemplate('facts.rapid-facts.v1');
    if (!tpl) {
      throw new Error("Expected to retrieve 'facts.rapid-facts.v1'");
    }
    if (tpl.category !== 'FACTS') {
      throw new Error(`Expected category FACTS, got ${tpl.category}`);
    }

    const recipe = registry.getShotRecipe('KINETIC_HOOK');
    if (!recipe) {
      throw new Error("Expected to retrieve shot recipe 'KINETIC_HOOK'");
    }
    if (recipe.name !== 'Kinetic Hook') {
      throw new Error(`Expected 'Kinetic Hook', got ${recipe.name}`);
    }
  });

  // Test 4: TemplateRegistry filtering by Category, CapabilityStatus, and Search
  await runTest('Test 4: TemplateRegistry filters templates accurately', () => {
    const registry = TemplateRegistry.getInstance();

    const historyTemplates = registry.listTemplates({ category: 'HISTORY' });
    if (historyTemplates.length === 0 || !historyTemplates.every(t => t.category === 'HISTORY')) {
      throw new Error('Category filter failed for HISTORY');
    }

    const readyTemplates = registry.listTemplates({ capabilityStatus: 'READY' });
    if (readyTemplates.length === 0 || !readyTemplates.every(t => t.capabilityStatus === 'READY')) {
      throw new Error('CapabilityStatus filter failed for READY');
    }

    const searchResults = registry.listTemplates({ search: 'horror' });
    if (searchResults.length === 0 || !searchResults.some(t => t.identity.id === 'story.micro-horror.v1')) {
      throw new Error("Search filter for 'horror' did not return micro-horror template");
    }
  });

  // Test 5: Legacy template migration
  await runTest('Test 5: TemplateRegistry migrates legacy prompt-only templates into valid TemplateDefinitions', () => {
    const registry = TemplateRegistry.getInstance();
    const legacy = {
      id: 'legacy-quantum-paradox',
      name: 'Quantum Paradox Generator',
      description: 'Legacy prompt based generator',
      category: 'QUANTUM_TRIVIA',
      promptSeed: 'Explain quantum paradoxes simply'
    };

    const migrated = registry.migrateLegacyTemplate(legacy);
    const parsed = TemplateDefinitionSchema.safeParse(migrated);
    if (!parsed.success) {
      throw new Error(`Migrated template failed validation: ${parsed.error.message}`);
    }

    if (migrated.identity.id !== 'migrated.legacy-quantum-paradox') {
      throw new Error(`Unexpected migrated ID: ${migrated.identity.id}`);
    }
    if (migrated.category !== 'QUANTUM_TRIVIA') {
      throw new Error(`Unexpected migrated category: ${migrated.category}`);
    }
    if (migrated.capabilityStatus !== 'BETA') {
      throw new Error('Migrated template should default to BETA status awaiting qualification');
    }
  });

  // Test 6: Fallback shot recipe integrity
  await runTest('Test 6: Fallback shot recipes resolve to existing valid recipes', () => {
    for (const recipe of Object.values(SHOT_RECIPES)) {
      if (recipe.fallbackRecipeId) {
        const fallback = SHOT_RECIPES[recipe.fallbackRecipeId];
        if (!fallback) {
          throw new Error(`Shot recipe ${recipe.id} has non-existent fallback ${recipe.fallbackRecipeId}`);
        }
      }
    }
  });

  const passed = results.every(r => r.passed);
  console.log(`\nTemplate Library Suite Result: ${results.filter(r => r.passed).length}/${results.length} PASSED`);
  return { passed, results };
}

if (require.main === module) {
  runTemplateLibraryTestSuite().then(res => {
    process.exitCode = res.passed ? 0 : 1;
  });
}
