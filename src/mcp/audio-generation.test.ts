import assert from 'node:assert/strict';
import { test } from 'node:test';
import { audioGenerationInputSchema, compileAudioGeneration } from './audio-generation';
import { validateLocalNarration } from '@/core/generation-providers/local-drama3';

test('fixed voice requires a paired project Asset and exact transcript; raw paths are rejected', () => {
  for (const bad of [{text:'Hi', referenceAssetId:'voice'}, {text:'Hi',referenceText:'Hello'},
    {text:'Hi',referenceAudioPath:'D:/voice.wav'}, {text:'Hi',temperature:NaN}, {text:'Hi',maxNewTokens:2048}])
    assert.equal(audioGenerationInputSchema.safeParse(bad).success, false);
  const generation = compileAudioGeneration('project', {text:'Hello.',referenceAssetId:'voice',referenceText:'A reference.',maxNewTokens:512});
  assert.deepEqual(generation.references,[{assetId:'voice',role:'audio_track'}]);
  assert.deepEqual(generation.parameters,{reference_text:'A reference.',max_new_tokens:512});
});

test('shared provider rejects missing reference text, extra media and unknown parameters', () => {
  validateLocalNarration({prompt:'Hello.'});
  validateLocalNarration({prompt:'Hello.',audio_urls:['https://validation.invalid/audio.wav'],reference_text:'A reference.',max_new_tokens:512});
  for (const input of [{prompt:'Hello.',audio_urls:['x']}, {prompt:'Hello.',reference_text:'A reference.'},
    {prompt:'Hello.',audio_urls:['a','b'],reference_text:'A reference.'}, {prompt:'Hello.',image_urls:['x']},
    {prompt:'Hello.',voice:'arbitrary'}, {prompt:'Hello.',max_new_tokens:NaN}, {prompt:'Hello.',top_p:0}])
    assert.throws(()=>validateLocalNarration(input));
});
