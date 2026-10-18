import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const directory = await mkdtemp(join(tmpdir(), 'beatdesign-generation-test-'));
process.env.BEATDESIGN_DATA_DIR = directory;
process.env.BEATDESIGN_GENERATION_PROVIDER = 'workstation';
execFileSync(
  process.execPath,
  ['node_modules/drizzle-kit/bin.cjs', 'push', '--force'],
  { env: process.env, stdio: 'pipe' }
);
after(async () => {
  const { getDb } = await import('@/core/workspace-lib/db-adapter');
  (await getDb()).$client.close();
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

const { createProject } = await import('@/core/projects/projects');
const {
  createAssetFirstGenerationIntent,
  preflightAssetFirstGeneration,
  submitAssetFirstGeneration,
} = await import('./submit');
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
    return {
      status: 'failed' as const,
      error: 'Fixture completed without a remote request.',
    };
  }
}
provider.createAdapter = (effect) => new FixtureAdapter(effect);
after(() => {
  provider.assertConfigured = originalConfigured;
  provider.createAdapter = originalAdapter;
});

test('local-only rejects cloud requests before adapters or upload intents are used', async () => {
  const previous = process.env.BEATDESIGN_LOCAL_ONLY;
  const project = await createProject({ name: 'Local-only rejection test' });
  const generation = { version: 2, projectId: project.id, modelId: 'nano-banana-pro',
    mode: 'image', prompt: 'Must remain local', references: [], parameters: {} };
  const before = inputs.length;
  try {
    process.env.BEATDESIGN_LOCAL_ONLY = '1';
    await assert.rejects(() => preflightAssetFirstGeneration(generation), /not available/);
    await assert.rejects(() => createAssetFirstGenerationIntent(generation), /not available/);
    const { submitEffectGeneration } = await import('@/core/effects/submit-generation');
    const cloudBinding = provider.modelBindings.find(binding => binding.modelId === generation.modelId)!;
    const legacy = await submitEffectGeneration({ projectId: project.id, effectId: cloudBinding.effectId,
      input: { prompt: generation.prompt } });
    assert.equal(legacy.status, 400);
    assert.match(String(legacy.body.error), /BEATDESIGN_LOCAL_ONLY/);
    const local = await preflightAssetFirstGeneration({ ...generation, modelId: 'local-flux3-klein', parameters: { aspect_ratio: '1:1' } });
    assert.equal(local.generation.modelId, 'local-flux3-klein');
    assert.equal(inputs.length, before);
  } finally {
    if (previous === undefined) delete process.env.BEATDESIGN_LOCAL_ONLY;
    else process.env.BEATDESIGN_LOCAL_ONLY = previous;
  }
});

test('UI and MCP generation requests compile identically through the shared service', async () => {
  const project = await createProject({ name: 'Parity test' });
  const generation = {
    version: 2,
    projectId: project.id,
    modelId: 'nano-banana-pro',
    mode: 'image',
    prompt: 'A green sculpture',
    references: [],
    parameters: { aspect_ratio: '1:1', wmOutputQuality: '2k' },
  };
  const intent = await createAssetFirstGenerationIntent(generation);
  await submitAssetFirstGeneration({
    generation,
    generationIntentId: intent,
    origin: 'ui',
  });
  await submitAssetFirstGeneration({ generation, origin: 'mcp' });
  assert.equal(inputs.length, 2);
  assert.deepEqual(inputs[0], inputs[1]);
});

test('missing assets and invalid parameters fail before any provider execution or upload', async () => {
  const project = await createProject({ name: 'Validation test' });
  const generation = {
    version: 2,
    projectId: project.id,
    modelId: 'nano-banana-pro',
    mode: 'image',
    prompt: 'A green sculpture',
    references: [],
    parameters: {},
  };
  const calls = inputs.length;
  await assert.rejects(
    () =>
      preflightAssetFirstGeneration({
        ...generation,
        references: [{ assetId: 'missing', role: 'reference' }],
      }),
    /does not belong/
  );
  await assert.rejects(
    () =>
      preflightAssetFirstGeneration({
        ...generation,
        parameters: { invented_parameter: 'invalid' },
      }),
    /Unsupported model parameters/
  );
  assert.equal(inputs.length, calls);
});

test('text context is project-scoped, frozen, validated and shared by UI and MCP', async () => {
  const { persistBeatDesignCommand } = await import('@/core/commands/persist');
  const { buildTextCard, resolveCanvasTextReferences } = await import(
    '@/core/beatcanvas/text-nodes'
  );
  const project = await createProject({ name: 'Text context' });
  const other = await createProject({ name: 'Other text project' });
  const text = buildTextCard({
    id: 'role',
    name: '主角',
    textRole: 'character',
    textContent: 'A sloth in a red scarf.',
  });
  const write = await persistBeatDesignCommand({
    projectId: project.id,
    origin: 'mcp',
    commandId: 'text-create',
    idempotencyKey: 'text-create',
    command: {
      type: 'canvas.apply',
      operations: [
        {
          type: 'upsert_text',
          cardId: text.id,
          name: text.name,
          textRole: text.textRole,
          textContent: text.textContent,
        },
      ],
    },
  });
  assert.equal(write.ok, true);
  const context = resolveCanvasTextReferences({
    cards: { role: text },
    referenceCardIds: ['role'],
    prompt: 'Walk.',
  });
  const generation = {
    version: 2,
    projectId: project.id,
    modelId: 'nano-banana-pro',
    mode: 'image',
    prompt: 'Walk.',
    textReferences: context.textReferences,
    references: [],
    parameters: {},
  };
  const calls = inputs.length;
  await submitAssetFirstGeneration({ generation, origin: 'ui' });
  await submitAssetFirstGeneration({ generation, origin: 'mcp' });
  assert.equal(
    (inputs.at(-1) as { prompt: string }).prompt,
    context.resolvedPrompt
  );
  assert.deepEqual(inputs[calls], inputs[calls + 1]);
  await assert.rejects(
    () => preflightAssetFirstGeneration({ ...generation, projectId: other.id }),
    /does not belong/
  );
  await assert.rejects(
    () =>
      preflightAssetFirstGeneration({
        ...generation,
        textReferences: [
          { ...context.textReferences[0], textContent: 'forged' },
        ],
      }),
    /changed/
  );
  await persistBeatDesignCommand({
    projectId: project.id,
    origin: 'mcp',
    commandId: 'text-long',
    idempotencyKey: 'text-long',
    command: {
      type: 'canvas.apply',
      operations: [
        {
          type: 'upsert_text',
          cardId: text.id,
          textContent: 'x'.repeat(20_000),
        },
      ],
    },
  });
  await assert.rejects(
    () =>
      preflightAssetFirstGeneration({
        ...generation,
        textReferences: [
          { ...context.textReferences[0], textContent: 'x'.repeat(20_000) },
        ],
      }),
    /characters or fewer/
  );
  assert.equal(inputs.length, calls + 2);
});

test('local H3 reads a project-owned image without cloud upload and rejects cross-project references', async () => {
  const { importLocalProjectAsset } = await import(
    '@/core/projects/import-local-asset'
  );
  const project = await createProject({ name: 'Local H3 boundary' });
  const other = await createProject({ name: 'Other project' });
  const filePath = join(directory, 'reference.png');
  await writeFile(
    filePath,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aEuoAAAAASUVORK5CYII=',
      'base64'
    )
  );
  const asset = await importLocalProjectAsset({
    projectId: project.id,
    filePath,
  });
  const generation = {
    version: 2,
    projectId: project.id,
    modelId: 'local-h3',
    mode: 'video',
    prompt: 'Connection test',
    references: [{ assetId: asset.id, role: 'reference' }],
    parameters: {
      wmDuration: '6.583s',
      _localReferencePaths: ['C:/forged.png'],
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Network upload attempted');
  };
  try {
    const prepared = await preflightAssetFirstGeneration(generation);
    assert.equal(prepared.expectedUploadCount, 0);
    await submitAssetFirstGeneration({ generation, origin: 'mcp' });
    const input = inputs.at(-1) as Record<string, string[]>;
    assert.equal(input.image_urls[0], asset.publicUrl);
    assert.equal(input._localReferencePaths.length, 1);
    assert.ok(input._localReferencePaths[0].includes(asset.id));
    assert.ok(!input._localReferencePaths[0].includes('forged'));
    await assert.rejects(
      () =>
        preflightAssetFirstGeneration({ ...generation, projectId: other.id }),
      /does not belong/
    );
    await assert.rejects(
      () =>
        preflightAssetFirstGeneration({
          ...generation,
          parameters: { wmDuration: '10s' },
        }),
      /Unsupported local H3 duration/
    );
    const { LOCAL_H3_DURATIONS, requireLocalH3Timing } = await import('./local-h3-duration');
    const { getGenerationModelDescriptor } = await import('./model-catalog');
    const descriptor = getGenerationModelDescriptor('local-h3')!;
    const schema = descriptor.parameterSchema as { wmDuration: { values: string[]; fps: number; frameCounts: Record<string, number> } };
    assert.deepEqual(schema.wmDuration.values, LOCAL_H3_DURATIONS);
    assert.equal(schema.wmDuration.fps, 24);
    for (const duration of LOCAL_H3_DURATIONS) {
      assert.equal(schema.wmDuration.frameCounts[duration], requireLocalH3Timing(duration).frames);
      const request = { ...generation, parameters: { wmDuration: duration } };
      const intent = await createAssetFirstGenerationIntent(request);
      await submitAssetFirstGeneration({ generation: request, generationIntentId: intent, origin: 'ui' });
      const uiInput = inputs.at(-1);
      await submitAssetFirstGeneration({ generation: request, origin: 'mcp' });
      assert.deepEqual(inputs.at(-1), uiInput);
      assert.equal((uiInput as Record<string, unknown>).wmDuration, duration);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('local narration enforces the short-text boundary and is discoverable as audio', async () => {
  const { getGenerationModelDescriptor } = await import('./model-catalog');
  assert.equal(getGenerationModelDescriptor('local-drama3')?.kind, 'audio');
  const project = await createProject({ name: 'Local voice boundary' });
  const generation = {
    version: 2,
    projectId: project.id,
    modelId: 'local-drama3',
    mode: 'audio',
    prompt: 'Hello world.',
    references: [],
    parameters: {},
  };
  assert.equal(
    (await preflightAssetFirstGeneration(generation)).expectedUploadCount,
    0
  );
  await assert.rejects(
    () =>
      preflightAssetFirstGeneration({ ...generation, prompt: 'x'.repeat(201) }),
    /200 characters/
  );
  await assert.rejects(
    () =>
      preflightAssetFirstGeneration({
        ...generation,
        parameters: { voice: 'unsupported' },
      }),
    /Unsupported/
  );
});

test('fixed narration voice uses a project-owned audio Asset and identical UI/MCP compilation', async () => {
  const { importLocalProjectAsset } = await import('@/core/projects/import-local-asset');
  const project = await createProject({ name: 'Fixed voice' });
  const other = await createProject({ name: 'Other voice owner' });
  const audioPath = join(directory, 'fixed-voice.wav');
  await writeFile(audioPath, Buffer.from('RIFFfixtureWAVE'));
  const voice = await importLocalProjectAsset({ projectId: project.id, filePath: audioPath });
  const foreign = await importLocalProjectAsset({ projectId: other.id, filePath: audioPath });
  const generation = { version: 2, projectId: project.id, modelId: 'local-drama3', mode: 'audio', prompt: 'Come back, cat!',
    references: [{assetId: voice.id, role: 'audio_track'}],
    parameters: {reference_text: 'A lovely day.', max_new_tokens: 256, _localReferences: [{path:'C:/forged.wav',type:'audio'}]} };
  assert.equal((await preflightAssetFirstGeneration(generation)).expectedUploadCount, 0);
  await submitAssetFirstGeneration({generation,origin:'ui'});
  const ui = inputs.at(-1) as Record<string,unknown>;
  await submitAssetFirstGeneration({generation,origin:'mcp'});
  assert.deepEqual(inputs.at(-1),ui);
  const refs = ui._localReferences as Array<{assetId:string;path:string;type:string}>;
  assert.equal(refs[0].assetId,voice.id); assert.equal(refs[0].type,'audio');
  assert.ok(!refs[0].path.includes('forged'));
  await assert.rejects(()=>preflightAssetFirstGeneration({...generation,references:[{assetId:foreign.id,role:'audio_track'}]}), /does not belong/);
  await assert.rejects(()=>preflightAssetFirstGeneration({...generation,parameters:{}}), /together/);
});

test('local Ref2VA delivers ordered typed project references identically from UI and MCP without upload', async () => {
  const { importLocalProjectAsset } = await import('@/core/projects/import-local-asset');
  const { copyFile } = await import('node:fs/promises');
  const project = await createProject({ name: 'Local mixed references' });
  const other = await createProject({ name: 'Unrelated references' });
  const imagePath = join(directory, 'mixed-image.png');
  const videoPath = join(directory, 'mixed-video.mp4');
  const audioPath = join(directory, 'mixed-audio.wav');
  await copyFile('public/logo.png', imagePath);
  await copyFile('tests/fixtures/tiny-black.mp4', videoPath);
  await writeFile(audioPath, Buffer.from('RIFFfixtureWAVE'));
  const assets: Array<Awaited<ReturnType<typeof importLocalProjectAsset>>> = [];
  for (const filePath of [audioPath, imagePath, videoPath]) assets.push(await importLocalProjectAsset({ projectId: project.id, filePath }));
  const generation = { version: 2, projectId: project.id, modelId: 'local-h3-ref2va', mode: 'video',
    prompt: 'Use @Image1, @Video1 and @Audio1.',
    references: assets.map(asset => ({ assetId: asset.id, role: asset.type === 'audio' ? 'audio_track' : 'reference' })),
    parameters: { wmDuration: '5.167s', _localReferences: [{ path: 'C:/forged.wav', type: 'audio' }] } };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Network upload attempted'); };
  try {
    assert.equal((await preflightAssetFirstGeneration(generation)).expectedUploadCount, 0);
    await submitAssetFirstGeneration({ generation, origin: 'ui' });
    const ui = inputs.at(-1) as Record<string, unknown>;
    await submitAssetFirstGeneration({ generation, origin: 'mcp' });
    assert.deepEqual(inputs.at(-1), ui);
    const refs = ui._localReferences as Array<{ assetId: string; type: string; path: string }>;
    assert.deepEqual(refs.map(ref => ref.type), ['audio', 'image', 'video']);
    assert.deepEqual(refs.map(ref => ref.assetId), assets.map(asset => asset.id));
    assert.ok(refs.every(ref => ref.path.includes(ref.assetId) && !ref.path.includes('forged')));
    await assert.rejects(() => preflightAssetFirstGeneration({ ...generation, projectId: other.id }), /does not belong/);
    await assert.rejects(() => preflightAssetFirstGeneration({ ...generation, references: [] }), /requires 1/);
    await assert.rejects(() => preflightAssetFirstGeneration({ ...generation, references: [{ assetId: assets[1].id, role: 'audio_track' }] }), /must be an audio/);
    await submitAssetFirstGeneration({ generation: { ...generation, references: [...generation.references, generation.references[0]] }, origin: 'mcp' });
    assert.deepEqual(inputs.at(-1), ui);
  } finally { globalThis.fetch = originalFetch; }
});

test('local model discovery and shared validation expose Ref2VA and FLUX reference limits', async () => {
  const { getGenerationModelDescriptor, validateGenerationModelInput } = await import('./model-catalog');
  const { LOCAL_H3_DURATIONS } = await import('./local-h3-duration');
  const ref = getGenerationModelDescriptor('local-h3-ref2va')!;
  const schema = ref.referenceSchema as { image: { max: number }; video: { max: number }; audio: { max: number }; maxTotal: number };
  assert.deepEqual([schema.image.max, schema.video.max, schema.audio.max, schema.maxTotal], [9, 3, 3, 12]);
  assert.deepEqual((ref.parameterSchema as { wmDuration: { values: string[] } }).wmDuration.values, LOCAL_H3_DURATIONS);
  for (const field of ['image_urls', 'video_urls', 'audio_urls']) {
    validateGenerationModelInput({ modelId: ref.id, input: { prompt: 'test', [field]: ['local'] } });
  }
  assert.throws(() => validateGenerationModelInput({ modelId: ref.id, input: { prompt: 'test', image_urls: Array(10).fill('x') } }), /at most 9/);
  assert.throws(() => validateGenerationModelInput({ modelId: ref.id, input: { prompt: 'test', image_urls: Array(9).fill('x'), video_urls: ['a','b','c'], audio_urls: ['d'] } }), /1–12/);
  const flux = getGenerationModelDescriptor('local-flux3-klein')!;
  assert.equal(flux.kind, 'image');
  const project = await createProject({ name: 'FLUX parity' });
  const generation = { version: 2, projectId: project.id, mode: 'image', modelId: flux.id, prompt: 'A ceramic cup', references: [], parameters: { aspect_ratio: '4:3', seed: 7 } };
  await submitAssetFirstGeneration({ generation, origin: 'ui' });
  const ui = inputs.at(-1);
  await submitAssetFirstGeneration({ generation, origin: 'mcp' });
  assert.deepEqual(inputs.at(-1), ui);
  assert.throws(() => validateGenerationModelInput({ modelId: flux.id, input: { prompt: 'test', aspect_ratio: '21:9' } }), /aspect ratio/);
  assert.equal((flux.referenceSchema as {image: {max: number}}).image.max, 10);
  validateGenerationModelInput({ modelId: flux.id, input: { prompt: 'test', image_urls: Array(10).fill('x') } });
  for (const image_urls of [Array(11).fill('x'), [''], [42], 'x'])
    assert.throws(() => validateGenerationModelInput({ modelId: flux.id, input: { prompt: 'test', image_urls } }), /at most 10/);
  for (const field of ['video_urls', 'audio_urls'])
    assert.throws(() => validateGenerationModelInput({ modelId: flux.id, input: { prompt: 'test', [field]: ['x'] } }), /Unsupported/);
});

test('FLUX image references preserve UI/MCP order, local ownership and deduplication without upload', async () => {
  const { importLocalProjectAsset } = await import('@/core/projects/import-local-asset');
  const { copyFile } = await import('node:fs/promises');
  const project = await createProject({name: 'FLUX edit parity'});
  const other = await createProject({name: 'Other FLUX project'});
  const assets: Array<Awaited<ReturnType<typeof importLocalProjectAsset>>> = [];
  for (let index = 0; index < 11; index++) {
    const filePath = join(directory, `flux-${index}.png`);
    await copyFile('public/logo.png', filePath);
    assets.push(await importLocalProjectAsset({projectId: project.id, filePath}));
  }
  const video = await importLocalProjectAsset({projectId: project.id, filePath: join(process.cwd(), 'tests/fixtures/tiny-black.mp4')});
  const generation = {version: 2, projectId: project.id, mode: 'image', modelId: 'local-flux3-klein',
    prompt: 'Combine @Image1 and @Image2.',
    references: [assets[1], assets[0]].map(asset => ({assetId: asset.id, role: 'reference'})),
    parameters: {aspect_ratio: '4:3', _localReferences: [{path: 'C:/forged.png', type: 'image'}], image_urls: ['https://forged.invalid/x.png']} };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {throw new Error('Network upload attempted');};
  try {
    assert.equal((await preflightAssetFirstGeneration(generation)).expectedUploadCount, 0);
    await submitAssetFirstGeneration({generation, origin: 'ui'});
    const ui = inputs.at(-1) as Record<string, unknown>;
    await submitAssetFirstGeneration({generation, origin: 'mcp'});
    assert.deepEqual(inputs.at(-1), ui);
    const refs = ui._localReferences as Array<{assetId: string; type: string; path: string}>;
    assert.deepEqual(refs.map(ref => ref.assetId), [assets[1].id, assets[0].id]);
    assert.ok(refs.every(ref => ref.type === 'image' && ref.path.includes(ref.assetId) && !ref.path.includes('forged')));
    await submitAssetFirstGeneration({generation: {...generation, references: [...generation.references, generation.references[0]]}, origin: 'mcp'});
    assert.deepEqual(inputs.at(-1), ui);
    await assert.rejects(() => preflightAssetFirstGeneration({...generation, projectId: other.id}), /does not belong/);
    await assert.rejects(() => preflightAssetFirstGeneration({...generation, references: [{assetId: video.id, role: 'reference'}]}), /image references only/);
    await assert.rejects(() => preflightAssetFirstGeneration({...generation, references: [{assetId: assets[0].id, role: 'audio_track'}]}), /must be an audio/);
    await assert.rejects(() => preflightAssetFirstGeneration({...generation, references: assets.map(asset => ({assetId: asset.id, role: 'reference'}))}), /at most 10/);
  } finally {globalThis.fetch = originalFetch;}
});

test('completed local audio is persisted with project ownership and a task-bound result', async () => {
  const { randomUUID } = await import('node:crypto');
  const { recordGeneration } = await import('@/core/effects/record-generation');
  const { persistEffectOutputIfNeeded } = await import(
    '@/core/effects/output-storage'
  );
  const { getProjectAssetById } = await import(
    '@/core/workspace-lib/assets/user-assets'
  );
  const { readLocalOutput } = await import('./local-runtime.server');
  const project = await createProject({ name: 'Local output' });
  const taskId = randomUUID();
  const jobDirectory = join(directory, 'local-jobs', taskId);
  await mkdir(jobDirectory, { recursive: true });
  await writeFile(
    join(jobDirectory, 'job.json'),
    JSON.stringify({ status: 'succeeded', model: 'local-drama3' })
  );
  await writeFile(
    join(jobDirectory, 'output.wav'),
    Buffer.from('RIFFfixtureWAVE')
  );
  const generationId = await recordGeneration({
    projectId: project.id,
    effectId: 9002,
    status: 'processing',
    input: { _provider: { id: 'workstation', modelId: 'local-drama3' } },
    output: { providerTaskId: taskId, taskId },
  });
  assert.ok(generationId);
  const result = (await persistEffectOutputIfNeeded({
    wmTaskId: generationId,
    effectId: 9002,
    effectType: 4,
    output: { result_url: `local-job:${taskId}` },
  })) as { assetIds: string[]; result_url: string };
  assert.ok(
    result.result_url.startsWith(`/api/app/projects/${project.id}/assets/`)
  );
  const asset = await getProjectAssetById({
    projectId: project.id,
    assetId: result.assetIds[0],
  });
  assert.equal(asset?.type, 'audio');
  assert.equal(asset?.mimeType, 'audio/wav');
  await assert.rejects(
    () => readLocalOutput(`local-job:${taskId}`, randomUUID()),
    /does not match/
  );
  await assert.rejects(
    () => readLocalOutput('local-job:../../private', '../../private'),
    /Invalid local job/
  );
});
