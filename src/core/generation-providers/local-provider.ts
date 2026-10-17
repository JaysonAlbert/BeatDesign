import { BaseAdapter, type GenerationResult } from '@/core/adapters/base-adapter';
import { beatApiGenerationProvider } from './beatapi-provider';
import type { GenerationProviderDefinition } from './contracts';
import { createServerOnlyFn } from '@tanstack/react-start';

const submit = createServerOnlyFn(async (model: string, input: unknown) =>
  (await import('./local-runtime.server')).submitLocalJob(model, input));
const status = createServerOnlyFn(async (id: string) =>
  (await import('./local-runtime.server')).readLocalJob(id));
const configured = createServerOnlyFn(async () =>
  (await import('./local-runtime.server')).assertLocalConfigured());

export const LOCAL_MODELS = ['local-h3', 'local-drama3'];
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
      await configured();
    } else await beatApiGenerationProvider.assertConfigured?.();
  },
  validateInput: (effect, input) => {
    if (!LOCAL_MODELS.includes(effect.model)) return beatApiGenerationProvider.validateInput?.(effect, input);
    if (effect.model === 'local-h3' && (!Array.isArray(input.image_urls) || input.image_urls.length !== 1))
      throw new Error('Local H3 requires exactly one first-frame image.');
    if (effect.model === 'local-h3' && (input.video_urls || input.audio_urls ||
        (input.wmDuration !== undefined && input.wmDuration !== '6.583s') ||
        (input.aspect_ratio !== undefined && input.aspect_ratio !== '16:9')))
      throw new Error('This pinned H3 workflow supports one image, 1024×576, 158 frames at 24 fps only.');
    const allowed = new Set(['prompt', '_localReferencePaths', ...(effect.model === 'local-h3' ? ['image_urls', 'seed', 'aspect_ratio', 'wmDuration'] : [])]);
    if (Object.keys(input).some(key => !allowed.has(key))) throw new Error('Unsupported local model parameter.');
    if (effect.model === 'local-drama3' && (String(input.prompt).length > 200 || input.image_urls || input.audio_urls || input.video_urls))
      throw new Error('Drama 3 preview accepts text only, up to 200 characters.');
    if (input.seed !== undefined && (!Number.isSafeInteger(input.seed) || Number(input.seed) < 0))
      throw new Error('Seed must be a non-negative safe integer.');
  },
};
