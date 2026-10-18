import { z } from 'zod';

export const LOCAL_NARRATION_MAX_TEXT = 200;
export const localNarrationParameters = z.object({
  reference_text: z.string().trim().min(1).max(4000).optional(),
  max_new_tokens: z.number().int().min(32).max(1024).optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().gt(0).max(1).optional(),
}).strict();

export function validateLocalNarration(input: Record<string, unknown>) {
  if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > LOCAL_NARRATION_MAX_TEXT)
    throw new Error('Drama 3 narration requires text up to 200 characters.');
  if (input.image_urls || input.video_urls) throw new Error('Drama 3 accepts audio references only.');
  const { prompt: _prompt, audio_urls, _localReferences: _refs, _localReferencePaths: _paths, ...parameters } = input;
  const parsed = localNarrationParameters.safeParse(parameters);
  if (!parsed.success) throw new Error(`Unsupported Drama 3 parameter: ${parsed.error.message}`);
  if (audio_urls !== undefined && (!Array.isArray(audio_urls) || audio_urls.length !== 1 ||
      audio_urls.some(url => typeof url !== 'string' || !url.trim())))
    throw new Error('Drama 3 accepts exactly one reference audio when supplied.');
  if (Boolean(audio_urls) !== Boolean(parsed.data.reference_text))
    throw new Error('Reference audio and its exact reference_text must be supplied together.');
}
