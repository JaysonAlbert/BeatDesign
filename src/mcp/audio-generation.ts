import { z } from 'zod';
import { LOCAL_NARRATION_MAX_TEXT } from '@/core/generation-providers/local-drama3';

export const audioGenerationInputSchema = z.object({
  projectId: z.string().min(1).max(160).optional(),
  text: z.string().trim().min(1).max(LOCAL_NARRATION_MAX_TEXT),
  referenceAssetId: z.string().min(1).max(200).optional(),
  referenceText: z.string().trim().min(1).max(4000).optional(),
  maxNewTokens: z.number().int().min(32).max(256).optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().gt(0).max(1).optional(),
}).strict().refine(v => Boolean(v.referenceAssetId) === Boolean(v.referenceText), {
  message: 'referenceAssetId and its exact referenceText must be supplied together.',
});

export function compileAudioGeneration(projectId: string, source: z.infer<typeof audioGenerationInputSchema>) {
  const input = audioGenerationInputSchema.parse(source);
  return { version: 2 as const, projectId, mode: 'audio' as const, modelId: 'local-drama3',
    prompt: input.text,
    references: input.referenceAssetId ? [{ assetId: input.referenceAssetId, role: 'audio_track' as const }] : [],
    parameters: {
      ...(input.referenceText !== undefined ? { reference_text: input.referenceText } : {}),
      ...(input.maxNewTokens !== undefined ? { max_new_tokens: input.maxNewTokens } : {}),
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      ...(input.topP !== undefined ? { top_p: input.topP } : {}),
    },
  };
}
