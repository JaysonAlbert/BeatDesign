import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { getBeatDesignDataRoot } from '@/config/data-root';
import type { GenerationResult } from '@/core/adapters/base-adapter';

export const localJobRoot = () => join(getBeatDesignDataRoot(), 'local-jobs');
export async function assertLocalConfigured() {
  const config = JSON.parse(await readFile(join(getBeatDesignDataRoot(), 'local-runtime.json'), 'utf8'));
  for (const key of ['python', 'openmontageRoot']) {
    if (typeof config[key] !== 'string') throw new Error(`Missing local runtime ${key}`);
    await stat(config[key]);
  }
  return config as { python: string; openmontageRoot: string };
}
function jobPath(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid local job id');
  return join(localJobRoot(), id, 'job.json');
}
async function wakeWorker() {
  const config = await assertLocalConfigured();
  const script = resolve(process.env.BEATDESIGN_ROOT || process.cwd(), 'scripts/local-worker.py');
  const log = openSync(join(localJobRoot(), 'worker.log'), 'a');
  const child = spawn(config.python, [script, '--jobs', localJobRoot(), '--runtime', config.openmontageRoot],
    { detached: true, windowsHide: true, stdio: ['ignore', log, log] });
  try {
    await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  } finally { closeSync(log); }
  child.unref();
}
export async function submitLocalJob(model: string, input: unknown): Promise<GenerationResult> {
  await assertLocalConfigured();
  if (!['local-h3', 'local-drama3'].includes(model)) throw new Error('Unsupported local model');
  const id = randomUUID();
  const path = jobPath(id);
  await mkdir(join(localJobRoot(), id), { recursive: true });
  await writeFile(path + '.tmp', JSON.stringify({ id, model, input, status: 'pending', createdAt: Date.now() }));
  await rename(path + '.tmp', path);
  await wakeWorker();
  return { status: 'pending', output: { taskId: id } };
}
export async function readLocalJob(id: string): Promise<GenerationResult> {
  const job = JSON.parse(await readFile(jobPath(id), 'utf8'));
  if (job.status === 'pending' || job.status === 'processing') await wakeWorker();
  return { status: job.status, error: job.error, output: { taskId: id,
    ...(job.status === 'succeeded' ? { result_url: `local-job:${id}`, provenance: job.provenance } : {}) } };
}
export async function readLocalOutput(url: string, expectedId: string) {
  const id = url.replace(/^local-job:/, '');
  if (id !== expectedId) throw new Error('Local output does not match generation task');
  const job = JSON.parse(await readFile(jobPath(id), 'utf8'));
  if (job.status !== 'succeeded') throw new Error('Local output is not complete');
  const audio = job.model === 'local-drama3';
  const path = join(localJobRoot(), id, audio ? 'output.wav' : 'output.mp4');
  const info = await stat(path);
  if (info.size > 100 * 1024 * 1024) throw new Error('Local output exceeds 100 MiB');
  return new Response(await readFile(path), { headers: { 'content-type': audio ? 'audio/wav' : 'video/mp4' } });
}
