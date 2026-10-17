import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getGenerationRuntimeConfig, parseLocalOnly, setBrowserGenerationRuntimeConfig } from './generation-runtime';
import { getWorkspaceModelsByType, getDefaultSelectableWorkspaceModel } from '@/core/effects/workspace-models';
import { getGenerationModelBinding } from '@/core/generation-providers/registry';
import { listGenerationModelDescriptors, validateGenerationModelInput } from '@/core/generation-providers/model-catalog';

test('local-only is a strict opt-in boolean', () => {
  for (const value of [undefined, '', '0', 'false', ' FALSE ']) assert.equal(parseLocalOnly(value), false);
  for (const value of ['1', 'true', ' TRUE ']) assert.equal(parseLocalOnly(value), true);
  assert.throws(() => parseLocalOnly('yes'), /BEATDESIGN_LOCAL_ONLY/);
});

test('runtime environment controls UI, MCP discovery and server model validation', () => {
  const previous = { localOnly: process.env.BEATDESIGN_LOCAL_ONLY, provider: process.env.BEATDESIGN_GENERATION_PROVIDER };
  try {
    process.env.BEATDESIGN_GENERATION_PROVIDER = 'beatapi';
    process.env.BEATDESIGN_LOCAL_ONLY = '1';
    assert.deepEqual(getGenerationRuntimeConfig(), { localOnly: true, providerId: 'workstation' });
    assert.deepEqual(getWorkspaceModelsByType('ai-image').map(model => model.id), ['local-flux3-klein']);
    assert.deepEqual(getWorkspaceModelsByType('ai-video').map(model => model.id), ['local-h3', 'local-h3-ref2va']);
    assert.equal(getDefaultSelectableWorkspaceModel('ai-image')?.id, 'local-flux3-klein');
    assert.equal(getDefaultSelectableWorkspaceModel('ai-video')?.id, 'local-h3');
    assert.equal(listGenerationModelDescriptors().length, 4);
    assert.ok(listGenerationModelDescriptors().every(model => model.id.startsWith('local-')));
    assert.equal(getGenerationModelBinding({ modelId: 'nano-banana-pro', providerId: 'beatapi' }), null);
    assert.throws(() => validateGenerationModelInput({ modelId: 'nano-banana-pro', input: { prompt: 'test' } }), /not available/);
    assert.throws(() => validateGenerationModelInput({ modelId: 'video-analysis', input: { prompt: 'test' } }), /not available/);
    process.env.BEATDESIGN_LOCAL_ONLY = '0';
    process.env.BEATDESIGN_GENERATION_PROVIDER = 'workstation';
    assert.ok(getWorkspaceModelsByType('ai-image').some(model => model.id === 'nano-banana-pro'));
    assert.ok(getWorkspaceModelsByType('ai-image').some(model => model.id === 'local-flux3-klein'));
    process.env.BEATDESIGN_GENERATION_PROVIDER = 'beatapi';
    assert.ok(getWorkspaceModelsByType('ai-image').every(model => !model.id.startsWith('local-')));
  } finally {
    if (previous.localOnly === undefined) delete process.env.BEATDESIGN_LOCAL_ONLY;
    else process.env.BEATDESIGN_LOCAL_ONLY = previous.localOnly;
    if (previous.provider === undefined) delete process.env.BEATDESIGN_GENERATION_PROVIDER;
    else process.env.BEATDESIGN_GENERATION_PROVIDER = previous.provider;
  }
});

test('browser uses the hydrated server policy without a Vite build-time flag', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });
    setBrowserGenerationRuntimeConfig({ localOnly: true, providerId: 'workstation' });
    assert.deepEqual(getWorkspaceModelsByType('ai-image').map(model => model.id), ['local-flux3-klein']);
    setBrowserGenerationRuntimeConfig({ localOnly: false, providerId: 'beatapi' });
    assert.ok(getWorkspaceModelsByType('ai-image').some(model => model.id === 'nano-banana-pro'));
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
