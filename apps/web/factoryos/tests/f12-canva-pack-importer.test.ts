import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { SecureTemplatePackImporter } from '../../lib/templates/import/SecureTemplatePackImporter';
import { ShortForgeTemplatePackManifestSchema } from '../../lib/templates/schemas/TemplatePackSchema';
import { TemplateRegistry } from '../../lib/templates/registry/TemplateRegistry';
import { ContentAddressedStore } from '../core/compute/cas/ContentAddressedStore';
import { LocalRenderAdapter, LocalRenderIntent } from '../core/render/LocalRenderAdapter';
import { VerificationEngine } from '../core/verification/VerificationEngine';

describe('ShortForge F12 — Canva Asset Pack Importer & Production Qualification', () => {
  const candidatesZip = [
    path.resolve(process.cwd(), 'packages', 'sample-packs', 'shortforge-quiz-template.zip'),
    path.resolve(process.cwd(), '..', 'packages', 'sample-packs', 'shortforge-quiz-template.zip'),
    path.resolve(__dirname, '..', '..', '..', '..', 'packages', 'sample-packs', 'shortforge-quiz-template.zip')
  ];
  const sampleZipPath = candidatesZip.find(p => fs.existsSync(p)) || candidatesZip[0];

  const candidatesManifest = [
    path.resolve(process.cwd(), 'packages', 'sample-packs', 'shortforge-quiz-template', 'manifest.json'),
    path.resolve(process.cwd(), '..', 'packages', 'sample-packs', 'shortforge-quiz-template', 'manifest.json'),
    path.resolve(__dirname, '..', '..', '..', '..', 'packages', 'sample-packs', 'shortforge-quiz-template', 'manifest.json')
  ];
  const manifestPath = candidatesManifest.find(p => fs.existsSync(p)) || candidatesManifest[0];

  const importer = new SecureTemplatePackImporter();
  const registry = TemplateRegistry.getInstance();
  const cas = ContentAddressedStore.getInstance();

  beforeAll(() => {
    expect(fs.existsSync(sampleZipPath)).toBe(true);
  });

  describe('Gate 1: Sandbox & Security Enforcement', () => {
    it('rejects nonexistent zip path with descriptive error', async () => {
      const res = await importer.importPackFromZip('/nonexistent/path/template.zip');
      expect(res.success).toBe(false);
      expect(res.error).toContain('not found');
    });

    it('validates ShortForgeTemplatePack/v1 manifest schema strictly', () => {
      const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const parsed = ShortForgeTemplatePackManifestSchema.safeParse(raw);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.schemaVersion).toBe('ShortForgeTemplatePack/v1');
        expect(parsed.data.identity.id).toBe('quiz.canva.v1');
        expect(parsed.data.identity.isSystem).toBe(false);
        expect(parsed.data.license.licenseType).toBe('CANVA_PRO');
        expect(parsed.data.assetBindings.length).toBe(7); // 6 questions + watermark
      }
    });

    it('rejects manifest with invalid schema version or missing steps', () => {
      const invalidManifest = {
        schemaVersion: 'Invalid/v99',
        identity: { id: 'invalid', name: 'Invalid' },
        category: 'QUIZ',
        formatFamily: 'Invalid',
        storyStructure: []
      };
      const parsed = ShortForgeTemplatePackManifestSchema.safeParse(invalidManifest);
      expect(parsed.success).toBe(false);
    });
  });

  describe('Gate 2: Pack Ingestion, CAS Storage & Idempotent Upsert', () => {
    it('successfully imports shortforge-quiz-template.zip into CAS and registry', async () => {
      const res = await importer.importPackFromZip(sampleZipPath);
      expect(res.success).toBe(true);
      expect(res.template).toBeDefined();
      expect(res.template?.identity.id).toBe('quiz.canva.v1');
      expect(res.template?.identity.isSystem).toBe(false);
      expect(res.template?.category).toBe('QUIZ');
      expect(res.template?.capabilityStatus).toBe('READY');

      // Verify asset inventory
      expect(res.assetInventory?.length).toBe(7);
      for (const asset of res.assetInventory || []) {
        expect(asset.sha256).toBeDefined();
        expect(asset.sha256.length).toBe(64);
        expect(asset.casUri).toBeDefined();
        expect(fs.existsSync(asset.casUri!)).toBe(true);
      }

      // Verify local design pack cache
      const packDir = path.resolve(process.cwd(), 'assets', 'canva', 'packs', 'quiz.canva.v1');
      expect(fs.existsSync(packDir)).toBe(true);
      expect(fs.existsSync(path.join(packDir, 'manifest.json'))).toBe(true);
      expect(fs.existsSync(path.join(packDir, 'question-01.png'))).toBe(true);
      expect(fs.existsSync(path.join(packDir, 'question-06.png'))).toBe(true);
      expect(fs.existsSync(path.join(packDir, 'shortforge-watermark.png'))).toBe(true);
    });

    it('retrieves imported template from TemplateRegistry', () => {
      const tpl = registry.getTemplate('quiz.canva.v1');
      expect(tpl).toBeDefined();
      expect(tpl?.identity.name).toBe('6-Question Canva Flagship Quiz');
      expect(tpl?.identity.isSystem).toBe(false);
      expect(tpl?.storyStructure.length).toBe(20); // 1 hook + 6 * (Q + Timer + Reveal) + 1 outro
      expect(tpl?.designPack?.packId).toBe('quiz.canva.v1');
    });

    it('enforces idempotent upsert: repeated imports do not duplicate records', async () => {
      const customFilePath = path.resolve(process.cwd(), 'data', 'custom-templates.json');
      const beforeContent = fs.existsSync(customFilePath) ? JSON.parse(fs.readFileSync(customFilePath, 'utf-8')) : [];
      const beforeCount = beforeContent.filter((t: any) => (t.identity?.id || t.id) === 'quiz.canva.v1').length;

      // Re-import
      const secondRes = await importer.importPackFromZip(sampleZipPath);
      expect(secondRes.success).toBe(true);

      const afterContent = JSON.parse(fs.readFileSync(customFilePath, 'utf-8'));
      const afterCount = afterContent.filter((t: any) => (t.identity?.id || t.id) === 'quiz.canva.v1').length;

      expect(afterCount).toBe(1);
      expect(afterCount).toBe(beforeCount === 0 ? 1 : beforeCount);
    });
  });

  describe('Gate 3: Physical Rendering & F07 Media Verification', () => {
    it('physically renders a verified 6-question Canva Quiz short using factoryos-render', async () => {
      const runId = `f12_canva_${Date.now()}`;
      const outputMp4 = path.resolve(process.cwd(), 'testing', 'artifacts', `${runId}.mp4`);
      osEnsureDir(path.dirname(outputMp4));

      const packDir = path.resolve(process.cwd(), 'assets', 'canva', 'packs', 'quiz.canva.v1');

      // Construct 6-question quiz RenderIntent with pack assets and watermark
      const intent: LocalRenderIntent = {
        project_id: `proj_${runId}`,
        title: '6-Question Canva Quiz Show',
        output_path: outputMp4,
        output: {
          width: 1080,
          height: 1920,
          fps: 30,
        },
        safe_area: {
          top: 160,
          bottom: 320,
          left: 60,
          right: 120,
        },
        scenes: [
          // Hook
          {
            scene_id: 'scene_hook',
            template_id: 'quiz.canva.v1',
            narration_text: 'Can You Score 6 Out Of 6 On This Ultimate Trivia?',
            duration_seconds: 1.5,
            shots: [
              {
                id: 'shot_hook',
                recipe_id: 'KINETIC_HOOK',
                start_seconds: 0.0,
                duration_seconds: 1.5,
                props: {
                  headline: 'CAN YOU SCORE 6/6?',
                  design_pack: 'quiz.canva.v1',
                  image_path: path.join(packDir, 'question-01.png'),
                },
              },
            ],
          },
          // Question 1
          {
            scene_id: 'scene_q1',
            template_id: 'quiz.canva.v1',
            narration_text: 'What is the largest desert on Earth?',
            duration_seconds: 2.0,
            shots: [
              {
                id: 'shot_q1',
                recipe_id: 'QUESTION_CARD',
                start_seconds: 0.0,
                duration_seconds: 2.0,
                props: {
                  categoryBadge: 'GEOGRAPHY',
                  question: 'What is the largest desert on Earth?',
                  options: ['Sahara', 'Antarctic', 'Gobi', 'Arabian'],
                  design_pack: 'quiz.canva.v1',
                  image_path: path.join(packDir, 'question-01.png'),
                },
              },
            ],
          },
          // Think Gate 1 (Countdown)
          {
            scene_id: 'scene_timer1',
            template_id: 'quiz.canva.v1',
            narration_text: '',
            duration_seconds: 1.0,
            shots: [
              {
                id: 'shot_timer1',
                recipe_id: 'COUNTDOWN',
                start_seconds: 0.0,
                duration_seconds: 1.0,
                props: {
                  seconds: 3,
                  question: 'What is the largest desert on Earth?',
                  options: ['Sahara', 'Antarctic', 'Gobi', 'Arabian'],
                  design_pack: 'quiz.canva.v1',
                  image_path: path.join(packDir, 'question-01.png'),
                },
              },
            ],
          },
          // Answer 1 Reveal
          {
            scene_id: 'scene_ans1',
            template_id: 'quiz.canva.v1',
            narration_text: 'The correct answer is Antarctic Desert.',
            duration_seconds: 1.5,
            shots: [
              {
                id: 'shot_ans1',
                recipe_id: 'ANSWER_REVEAL',
                start_seconds: 0.0,
                duration_seconds: 1.5,
                props: {
                  correctOption: 'B: Antarctic',
                  explanation: 'Antarctica is a polar desert spanning over 14 million square kilometers.',
                  highlightOptionIndex: 1,
                  design_pack: 'quiz.canva.v1',
                  image_path: path.join(packDir, 'question-01.png'),
                },
              },
            ],
          },
          // Question 2
          {
            scene_id: 'scene_q2',
            template_id: 'quiz.canva.v1',
            narration_text: 'What element makes up most of the Sun?',
            duration_seconds: 2.0,
            shots: [
              {
                id: 'shot_q2',
                recipe_id: 'QUESTION_CARD',
                start_seconds: 0.0,
                duration_seconds: 2.0,
                props: {
                  categoryBadge: 'SCIENCE',
                  question: 'What element makes up most of the Sun?',
                  options: ['Helium', 'Hydrogen', 'Oxygen', 'Carbon'],
                  design_pack: 'quiz.canva.v1',
                  image_path: path.join(packDir, 'question-02.png'),
                },
              },
            ],
          },
          // Answer 2 Reveal
          {
            scene_id: 'scene_ans2',
            template_id: 'quiz.canva.v1',
            narration_text: 'Hydrogen comprises roughly 73% of the Sun.',
            duration_seconds: 1.5,
            shots: [
              {
                id: 'shot_ans2',
                recipe_id: 'ANSWER_REVEAL',
                start_seconds: 0.0,
                duration_seconds: 1.5,
                props: {
                  correctOption: 'B: Hydrogen',
                  explanation: 'Hydrogen makes up about 73% of the Sun by mass.',
                  highlightOptionIndex: 1,
                  design_pack: 'quiz.canva.v1',
                  image_path: path.join(packDir, 'question-02.png'),
                },
              },
            ],
          },
          // Outro
          {
            scene_id: 'scene_outro',
            template_id: 'quiz.canva.v1',
            narration_text: 'How many did you get right? Comment below!',
            duration_seconds: 1.5,
            shots: [
              {
                id: 'shot_outro',
                recipe_id: 'OUTRO_CTA',
                start_seconds: 0.0,
                duration_seconds: 1.5,
                props: {
                  headline: 'COMMENT YOUR SCORE!',
                  design_pack: 'quiz.canva.v1',
                  image_path: path.join(packDir, 'question-06.png'),
                },
              },
            ],
          },
        ],
      };

      const adapter = new LocalRenderAdapter();
      const receipt = await adapter.render(intent);

      expect(receipt.validation.is_valid).toBe(true);
      expect(receipt.validation.file_exists).toBe(true);
      expect(fs.existsSync(outputMp4)).toBe(true);

      const stat = fs.statSync(outputMp4);
      expect(stat.size).toBeGreaterThan(100_000); // Substantial video file

      // Ingest rendered MP4 into CAS
      const artifactRef = await cas.putFile(outputMp4, 'rendered_short', 'video/mp4');
      expect(artifactRef.sha256).toBeDefined();

      // Audit physical media truth via VerificationEngine
      const mediaAudit = await VerificationEngine.auditMediaArtifact({
        videoUrl: outputMp4,
        jobId: runId,
      });

      expect(mediaAudit.verified).toBe(true);
      expect(mediaAudit.hardGates.artifactExists).toBe(true);
      expect(mediaAudit.hardGates.validContainer).toBe(true);
      expect(mediaAudit.hardGates.videoStreamPresent).toBe(true);
      expect(mediaAudit.hardGates.exact9x16Geometry).toBe(true);
      expect(mediaAudit.measurements.width).toBe(1080);
      expect(mediaAudit.measurements.height).toBe(1920);
      expect(mediaAudit.measurements.videoCodec.toLowerCase()).toContain('h264');
      expect(mediaAudit.measurements.videoDuration).toBeGreaterThanOrEqual(8.0);
    }, 60000);
  });
});

function osEnsureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
