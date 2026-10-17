import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const headers = { 'x-beatapi-workspace-request': '1' };
const wav = (size: number) => {
  const bytes = Buffer.alloc(size);
  bytes.write('RIFF');
  bytes.writeUInt32LE(size - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(44100, 24);
  bytes.writeUInt32LE(88200, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(size - 44, 40);
  return bytes;
};

test('local browser uploads accept a full narration beyond the reference clip limit', async ({ request }) => {
  const created = await request.post('/api/app/projects', { headers, data: { name: 'Long local narration QA' } });
  expect(created.ok()).toBeTruthy();
  const projectId = (await created.json()).id;
  const size = 16 * 1024 * 1024;
  const uploaded = await request.post(`/api/app/projects/${projectId}/assets`, {
    headers,
    multipart: { file: { name: 'full-narration.wav', mimeType: 'audio/wav', buffer: wav(size) } },
  });
  expect(uploaded.status()).toBe(200);
  const { asset } = await uploaded.json();
  expect(asset.type).toBe('audio');
  expect(asset.sizeBytes).toBe(size);
  const stored = await request.get(asset.publicUrl);
  expect(stored.status()).toBe(200);
  expect((await stored.body()).length).toBe(size);
});

test('project media remains complete beyond 30 items while global recents stay bounded', async ({ request }) => {
  const created = await request.post('/api/app/projects', { headers, data: { name: 'Full asset list QA' } });
  const projectId = (await created.json()).id;
  const image = await readFile('public/logo.png');
  const video = await readFile('tests/fixtures/tiny-black.mp4');
  const kinds = [
    { type: 'images', name: 'png', mimeType: 'image/png', buffer: image },
    { type: 'videos', name: 'mp4', mimeType: 'video/mp4', buffer: video },
    { type: 'audios', name: 'wav', mimeType: 'audio/wav', buffer: wav(46) },
  ];
  const first = new Map<string, string>();
  for (const kind of kinds) {
    for (let index = 0; index < 32; index += 1) {
      const uploaded = await request.post(`/api/app/projects/${projectId}/assets`, {
        headers,
        multipart: { file: { name: `asset-${index}.${kind.name}`, mimeType: kind.mimeType, buffer: kind.buffer } },
      });
      expect(uploaded.ok()).toBeTruthy();
      const { asset } = await uploaded.json();
      if (index === 0) first.set(kind.type, asset.id);
    }
  }
  const scoped = await (await request.get(`/api/app/recent-assets?projectId=${projectId}`)).json();
  for (const kind of kinds) {
    expect(scoped[kind.type]).toHaveLength(32);
    expect(scoped[kind.type].some((asset: { id: string }) => asset.id === first.get(kind.type))).toBe(true);
    expect(new Set(scoped[kind.type].map((asset: { id: string }) => asset.id)).size).toBe(32);
  }
  const other = await request.post('/api/app/projects', { headers, data: { name: 'Unrelated project' } });
  const otherId = (await other.json()).id;
  const empty = await (await request.get(`/api/app/recent-assets?projectId=${otherId}`)).json();
  expect(empty).toEqual({ images: [], videos: [], audios: [] });
  const global = await (await request.get('/api/app/recent-assets')).json();
  for (const kind of kinds) expect(global[kind.type]).toHaveLength(30);
});
