import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const directory = await mkdtemp(join(tmpdir(), 'beatdesign-generation-test-'));
process.env.BEATDESIGN_DATA_DIR = directory;
process.env.BEATDESIGN_GENERATION_PROVIDER = 'workstation';
execFileSync(process.execPath, ['node_modules/drizzle-kit/bin.cjs', 'push', '--force'], { env: process.env, stdio: 'pipe' });
after(async () => { const { getDb } = await import('@/core/workspace-lib/db-adapter'); (await getDb()).$client.close(); await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });

const { createProject } = await import('@/core/projects/projects');
const { createAssetFirstGenerationIntent, preflightAssetFirstGeneration, submitAssetFirstGeneration } = await import('./submit');
const { getActiveGenerationProvider } = await import('./registry');
const { BaseAdapter } = await import('@/core/adapters/base-adapter');
const provider = getActiveGenerationProvider();
const originalConfigured = provider.assertConfigured;
const originalAdapter = provider.createAdapter;
const inputs: unknown[] = [];
provider.assertConfigured = async () => {};
class FixtureAdapter extends BaseAdapter {
  async createGeneration(input: unknown) {
    inputs.push(input);
    return { status: 'failed' as const, error: 'Fixture completed without a remote request.' };
  }
}
provider.createAdapter = (effect) => new FixtureAdapter(effect);
after(() => { provider.assertConfigured = originalConfigured; provider.createAdapter = originalAdapter; });

test('UI and MCP generation requests compile identically through the shared service', async () => {
  const project = await createProject({ name: 'Parity test' });
  const generation = { version: 2, projectId: project.id, modelId: 'nano-banana-pro', mode: 'image', prompt: 'A green sculpture', references: [], parameters: { aspect_ratio: '1:1', wmOutputQuality: '2k' } };
  const intent = await createAssetFirstGenerationIntent(generation);
  await submitAssetFirstGeneration({ generation, generationIntentId: intent, origin: 'ui' });
  await submitAssetFirstGeneration({ generation, origin: 'mcp' });
  assert.equal(inputs.length, 2);
  assert.deepEqual(inputs[0], inputs[1]);
});

test('missing assets and invalid parameters fail before any provider execution or upload', async () => {
  const project = await createProject({ name: 'Validation test' });
  const generation = { version: 2, projectId: project.id, modelId: 'nano-banana-pro', mode: 'image', prompt: 'A green sculpture', references: [], parameters: {} };
  const calls = inputs.length;
  await assert.rejects(() => preflightAssetFirstGeneration({ ...generation, references: [{ assetId: 'missing', role: 'reference' }] }), /does not belong/);
  await assert.rejects(() => preflightAssetFirstGeneration({ ...generation, parameters: { invented_parameter: 'invalid' } }), /Unsupported model parameters/);
  assert.equal(inputs.length, calls);
});

test('local H3 reads a project-owned image without cloud upload and rejects cross-project references', async () => {
  const { importLocalProjectAsset } = await import('@/core/projects/import-local-asset');
  const project = await createProject({ name: 'Local H3 boundary' });
  const other = await createProject({ name: 'Other project' });
  const filePath = join(directory, 'reference.png');
  await writeFile(filePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aEuoAAAAASUVORK5CYII=', 'base64'));
  const asset = await importLocalProjectAsset({ projectId: project.id, filePath });
  const generation = { version: 2, projectId: project.id, modelId: 'local-h3', mode: 'video', prompt: 'Connection test', references: [{ assetId: asset.id, role: 'reference' }], parameters: { wmDuration: '6.583s', _localReferencePaths: ['C:/forged.png'] } };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Network upload attempted'); };
  try {
    const prepared = await preflightAssetFirstGeneration(generation);
    assert.equal(prepared.expectedUploadCount, 0);
    await submitAssetFirstGeneration({ generation, origin: 'mcp' });
    const input = inputs.at(-1) as Record<string, string[]>;
    assert.equal(input.image_urls[0], asset.publicUrl);
    assert.equal(input._localReferencePaths.length, 1);
    assert.ok(input._localReferencePaths[0].includes(asset.id));
    assert.ok(!input._localReferencePaths[0].includes('forged'));
    await assert.rejects(() => preflightAssetFirstGeneration({ ...generation, projectId: other.id }), /does not belong/);
    await assert.rejects(() => preflightAssetFirstGeneration({ ...generation, parameters: { wmDuration: '10s' } }), /pinned H3/);
  } finally { globalThis.fetch = originalFetch; }
});

test('local narration enforces the short-text boundary and is discoverable as audio', async () => {
  const { getGenerationModelDescriptor } = await import('./model-catalog');
  assert.equal(getGenerationModelDescriptor('local-drama3')?.kind, 'audio');
  const project = await createProject({ name: 'Local voice boundary' });
  const generation = { version: 2, projectId: project.id, modelId: 'local-drama3', mode: 'audio', prompt: 'Hello world.', references: [], parameters: {} };
  assert.equal((await preflightAssetFirstGeneration(generation)).expectedUploadCount, 0);
  await assert.rejects(() => preflightAssetFirstGeneration({ ...generation, prompt: 'x'.repeat(201) }), /200 characters/);
  await assert.rejects(() => preflightAssetFirstGeneration({ ...generation, parameters: { voice: 'unsupported' } }), /Unsupported/);
});

test('completed local audio is persisted with project ownership and a task-bound result', async () => {
  const { randomUUID } = await import('node:crypto');
  const { recordGeneration } = await import('@/core/effects/record-generation');
  const { persistEffectOutputIfNeeded } = await import('@/core/effects/output-storage');
  const { getProjectAssetById } = await import('@/core/workspace-lib/assets/user-assets');
  const { readLocalOutput } = await import('./local-runtime.server');
  const project = await createProject({ name: 'Local output' });
  const taskId = randomUUID();
  const jobDirectory = join(directory, 'local-jobs', taskId);
  await mkdir(jobDirectory, { recursive: true });
  await writeFile(join(jobDirectory, 'job.json'), JSON.stringify({ status: 'succeeded', model: 'local-drama3' }));
  await writeFile(join(jobDirectory, 'output.wav'), Buffer.from('RIFFfixtureWAVE'));
  const generationId = await recordGeneration({ projectId: project.id, effectId: 9002, status: 'processing', input: { _provider: { id: 'workstation', modelId: 'local-drama3' } }, output: { providerTaskId: taskId, taskId } });
  assert.ok(generationId);
  const result = await persistEffectOutputIfNeeded({ wmTaskId: generationId, effectId: 9002, effectType: 4, output: { result_url: `local-job:${taskId}` } }) as { assetIds: string[]; result_url: string };
  assert.ok(result.result_url.startsWith(`/api/app/projects/${project.id}/assets/`));
  const asset = await getProjectAssetById({ projectId: project.id, assetId: result.assetIds[0] });
  assert.equal(asset?.type, 'audio');
  assert.equal(asset?.mimeType, 'audio/wav');
  await assert.rejects(() => readLocalOutput(`local-job:${taskId}`, randomUUID()), /does not match/);
  await assert.rejects(() => readLocalOutput('local-job:../../private', '../../private'), /Invalid local job/);
});
