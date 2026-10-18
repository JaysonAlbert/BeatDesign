import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const directory = await mkdtemp(join(tmpdir(),'beatdesign-mcp-upload-'));
process.env.BEATDESIGN_DATA_DIR=directory;
execFileSync(process.execPath,['node_modules/drizzle-kit/bin.cjs','push','--force'],{env:process.env,stdio:'pipe'});
const {createProject}=await import('@/core/projects/projects');
const {assetUploadInputSchema,uploadProjectAssetChunk,UPLOAD_CHUNK_BYTES}=await import('./asset-upload');
const {getProjectAssetById}=await import('@/core/workspace-lib/assets/user-assets');
after(async()=>{const {getDb}=await import('@/core/workspace-lib/db-adapter');(await getDb()).$client.close();await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});});

test('chunk upload resumes, checks digest and imports the same project Asset without accepting paths',async()=>{
  const project=await createProject({name:'Upload'});
  const bytes=Buffer.concat([await readFile('public/logo.png'),Buffer.alloc(UPLOAD_CHUNK_BYTES)]);
  const count=Math.ceil(bytes.length/UPLOAD_CHUNK_BYTES);
  const base={uploadId:randomUUID(),filename:'cover.png',sizeBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  const chunk=(index:number)=>({...base,partIndex:index,dataBase64:bytes.subarray(index*UPLOAD_CHUNK_BYTES,(index+1)*UPLOAD_CHUNK_BYTES).toString('base64')});
  const first=await uploadProjectAssetChunk(project.id,chunk(0));
  assert.equal(first.complete,false);
  assert.deepEqual(await uploadProjectAssetChunk(project.id,chunk(0)),first);
  await assert.rejects(()=>uploadProjectAssetChunk(project.id,{...chunk(0),filename:'different.png'}),/different file/);
  let result:any;
  for(let i=1;i<count;i++)result=await uploadProjectAssetChunk(project.id,chunk(i));
  assert.equal(result.complete,true);
  assert.ok(await getProjectAssetById({projectId:project.id,assetId:result.asset.id}));
  assert.deepEqual(await uploadProjectAssetChunk(project.id,chunk(count-1)),result);
  assert.equal(assetUploadInputSchema.safeParse({...chunk(0),filename:'../cover.png'}).success,false);
  assert.equal(assetUploadInputSchema.safeParse({...chunk(0),filePath:'C:/secret.png'}).success,false);
});

test('bad checksum and undeclared byte lengths cannot create an Asset',async()=>{
  const project=await createProject({name:'Bad bytes'});
  const data=await readFile('public/logo.png');
  const input={uploadId:randomUUID(),filename:'logo.png',sizeBytes:data.length,sha256:'0'.repeat(64),partIndex:0,dataBase64:data.toString('base64')};
  await assert.rejects(()=>uploadProjectAssetChunk(project.id,input),/checksum/);
  await assert.rejects(()=>uploadProjectAssetChunk(project.id,{...input,uploadId:randomUUID(),sizeBytes:data.length+1}),/size/);
});
