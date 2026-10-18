import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { getBeatDesignDataRoot } from '@/config/data-root';
import { getProject } from '@/core/projects/projects';
import { importLocalProjectAsset, validateLocalAssetImportCandidate } from '@/core/projects/import-local-asset';

export const UPLOAD_CHUNK_BYTES = 512 * 1024;
export const assetUploadInputSchema = z.object({
  projectId: z.string().min(1).max(160).optional(),
  uploadId: z.string().uuid(),
  filename: z.string().min(1).max(180).regex(/^[^<>:"/\\|?*\x00-\x1f]+$/),
  sizeBytes: z.number().int().min(1).max(64 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  partIndex: z.number().int().min(0).max(127),
  dataBase64: z.string().min(4).max(4 * Math.ceil(UPLOAD_CHUNK_BYTES / 3)),
}).strict();

const pending = new Map<string, Promise<unknown>>();
export async function uploadProjectAssetChunk(projectId: string, source: z.infer<typeof assetUploadInputSchema>) {
  const input = assetUploadInputSchema.parse(source);
  const key = `${projectId}:${input.uploadId}`;
  const previous = pending.get(key) ?? Promise.resolve();
  const operation = previous.catch(() => {}).then(() => saveChunk(projectId, input));
  pending.set(key, operation);
  try { return await operation; } finally { if (pending.get(key) === operation) pending.delete(key); }
}

async function saveChunk(projectId: string, input: z.infer<typeof assetUploadInputSchema>) {
  const project = await getProject({projectId});
  if (!project || project.status !== 'active') throw new Error('Project not found');
  validateLocalAssetImportCandidate({filename:input.filename,size:input.sizeBytes});
  if (input.filename.endsWith('.') || input.filename.endsWith(' ') || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(input.filename))
    throw new Error('Invalid media filename');
  const parts = Math.ceil(input.sizeBytes / UPLOAD_CHUNK_BYTES);
  if (input.partIndex >= parts) throw new Error('Upload part is outside the declared file');
  const data = Buffer.from(input.dataBase64,'base64');
  if (data.toString('base64') !== input.dataBase64) throw new Error('Invalid canonical base64');
  const expected = Math.min(UPLOAD_CHUNK_BYTES, input.sizeBytes - input.partIndex * UPLOAD_CHUNK_BYTES);
  if (data.length !== expected) throw new Error('Upload part size does not match declared file');
  const projectKey = createHash('sha256').update(projectId).digest('hex');
  const directory = join(getBeatDesignDataRoot(),'mcp-uploads',projectKey,input.uploadId);
  await mkdir(directory,{recursive:true});
  const meta = JSON.stringify({projectId,filename:input.filename,sizeBytes:input.sizeBytes,sha256:input.sha256});
  const manifest = join(directory,'manifest.json');
  try { await writeFile(manifest,meta,{flag:'wx'}); }
  catch(error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (await readFile(manifest,'utf8') !== meta) throw new Error('Upload ID is already bound to a different file'); }
  const receiptPath = join(directory,'receipt.json');
  const receipt = await readFile(receiptPath,'utf8').catch(error => {
    if (error.code !== 'ENOENT') throw error; return null;
  });
  if (receipt) return JSON.parse(receipt);
  const partPath = (n:number) => join(directory,`${n}.part`);
  try { await writeFile(partPath(input.partIndex),data,{flag:'wx'}); }
  catch(error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (!(await readFile(partPath(input.partIndex))).equals(data)) throw new Error('Conflicting upload part; use a new upload ID'); }
  const buffers: Buffer[] = [];
  const missing: number[] = [];
  for (let n=0;n<parts;n++) {
    try { buffers.push(await readFile(partPath(n))); }
    catch(error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;missing.push(n); }
  }
  if (missing.length) return {complete:false,uploadId:input.uploadId,missingParts:missing};
  const bytes = Buffer.concat(buffers);
  if (bytes.length !== input.sizeBytes || createHash('sha256').update(bytes).digest('hex') !== input.sha256)
    throw new Error('Upload checksum mismatch; retained parts for inspection');
  const assembled = join(directory,input.filename);
  await writeFile(assembled,bytes);
  const importing = join(directory,'importing.json');
  try { await writeFile(importing,JSON.stringify({at:new Date().toISOString()}),{flag:'wx'}); }
  catch(error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    throw new Error('Previous final import outcome is ambiguous; inspect project Assets before retrying with a new upload ID'); }
  let asset;
  try { asset = await importLocalProjectAsset({projectId,filePath:assembled}); }
  catch(error) { await rm(importing); throw error; }
  const result = {complete:true,uploadId:input.uploadId,sha256:input.sha256,asset};
  await writeFile(receiptPath,JSON.stringify(result));
  await Promise.all([rm(assembled),...Array.from({length:parts},(_,n)=>rm(partPath(n)))]);
  return result;
}
