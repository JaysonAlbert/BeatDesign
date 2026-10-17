import { BaseAdapter, type GenerationResult } from '@/core/adapters/base-adapter';
import { beatApiGenerationProvider } from './beatapi-provider';
import type { GenerationProviderDefinition } from './contracts';
import { createServerOnlyFn } from '@tanstack/react-start';
import { requireLocalH3Timing } from './local-h3-duration';
import referenceLimits from './local-h3-ref2va.json';
import flux3 from './local-flux3.json';

const submit = createServerOnlyFn(async (model: string, input: unknown) =>
  (await import('./local-runtime.server')).submitLocalJob(model, input));
const status = createServerOnlyFn(async (id: string) =>
  (await import('./local-runtime.server')).readLocalJob(id));
const configured = createServerOnlyFn(async (model?: string) =>
  (await import('./local-runtime.server')).assertLocalConfigured(model));

// Keep existing effect IDs stable: persisted generations use these bindings.
export const LOCAL_MODELS = ['local-h3', 'local-drama3', 'local-h3-ref2va', 'local-flux3-klein'];
class LocalAdapter extends BaseAdapter {
  async createGeneration(input: unknown): Promise<GenerationResult> {
    return submit(this.effect.model, input);
  }
  async checkStatus(id: string): Promise<GenerationResult> {
    return status(id);
  }
}

export const localGenerationProvider: GenerationProviderDefinition = {
  id: 'workstation', label: 'Local workstation + BeatAPI',
  supports: ['image', 'video', 'audio', 'analysis'],
  modelBindings: [
    ...LOCAL_MODELS.map((modelId, index) => ({ modelId, effectId: 9001 + index,
      upstreamModelId: modelId, uploadPath: 'local', imageBucketName: 'local' })),
    ...beatApiGenerationProvider.modelBindings,
  ],
  createAdapter: effect => LOCAL_MODELS.includes(effect.model)
    ? new LocalAdapter(effect) : beatApiGenerationProvider.createAdapter(effect),
  assertConfigured: async effect => {
    if (effect && LOCAL_MODELS.includes(effect.model)) {
      await configured(effect.model);
    } else await beatApiGenerationProvider.assertConfigured?.();
  },
  validateInput: (effect, input) => {
    if (!LOCAL_MODELS.includes(effect.model)) return beatApiGenerationProvider.validateInput?.(effect, input);
    if (effect.model === 'local-h3' && (!Array.isArray(input.image_urls) || input.image_urls.length !== 1))
      throw new Error('Local H3 requires exactly one first-frame image.');
    if (effect.model === 'local-h3' && (input.video_urls || input.audio_urls ||
        (input.aspect_ratio !== undefined && input.aspect_ratio !== '16:9')))
      throw new Error('This pinned H3 workflow supports one image, 1024×576 at 24 fps only.');
    const isH3 = effect.model === 'local-h3' || effect.model === 'local-h3-ref2va';
    if (isH3) requireLocalH3Timing(input.wmDuration);
    if (effect.model === 'local-h3-ref2va') {
      let total = 0;
      for (const kind of ['image', 'video', 'audio'] as const) {
        const urls = input[`${kind}_urls`];
        if (urls === undefined) continue;
        if (!Array.isArray(urls) || urls.some(url => typeof url !== 'string' || !url.trim()) || urls.length > referenceLimits[kind])
          throw new Error(`Local Ref2VA accepts at most ${referenceLimits[kind]} ${kind} references.`);
        total += urls.length;
      }
      if (total < 1 || total > referenceLimits.total)
        throw new Error(`Local Ref2VA requires 1–${referenceLimits.total} references in total.`);
      if (input.aspect_ratio !== undefined && input.aspect_ratio !== '16:9')
        throw new Error('Local Ref2VA supports 1024×576 at 24 fps only.');
    }
    if (effect.model === 'local-flux3-klein' && !Object.hasOwn(flux3.ratios, String(input.aspect_ratio ?? '1:1')))
      throw new Error('Unsupported local FLUX 3 aspect ratio.');
    if (effect.model === 'local-flux3-klein' && input.image_urls !== undefined &&
        (!Array.isArray(input.image_urls) || input.image_urls.length > flux3.maxReferenceImages ||
          input.image_urls.some(url => typeof url !== 'string' || !url.trim())))
      throw new Error(`Local FLUX 3 accepts at most ${flux3.maxReferenceImages} image references.`);
    const allowed = new Set(['prompt', '_localReferencePaths', '_localReferences', ...(isH3 ? ['image_urls', 'seed', 'aspect_ratio', 'wmDuration'] : []), ...(effect.model === 'local-h3-ref2va' ? ['video_urls', 'audio_urls'] : []), ...(effect.model === 'local-flux3-klein' ? ['image_urls', 'seed', 'aspect_ratio'] : [])]);
    if (Object.keys(input).some(key => !allowed.has(key))) throw new Error('Unsupported local model parameter.');
    if (effect.model === 'local-drama3' && (String(input.prompt).length > 200 || input.image_urls || input.audio_urls || input.video_urls))
      throw new Error('Drama 3 preview accepts text only, up to 200 characters.');
    if (input.seed !== undefined && (!Number.isSafeInteger(input.seed) || Number(input.seed) < 0))
      throw new Error('Seed must be a non-negative safe integer.');
  },
};
