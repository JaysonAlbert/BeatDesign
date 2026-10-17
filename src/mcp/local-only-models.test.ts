import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { test } from 'node:test';

test('MCP local-only startup discovers only local integrations and rejects cloud lookup', async () => {
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/mcp-server.ts'], {
    env: { ...process.env, BEATDESIGN_LOCAL_ONLY: '1', BEATDESIGN_GENERATION_PROVIDER: 'beatapi' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const lines = createInterface({ input: child.stdout });
  const iterator = lines[Symbol.asyncIterator]();
  let id = 0;
  const rpc = async (method: string, params: Record<string, unknown>) => {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params })}\n`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const line = await Promise.race([
        iterator.next(),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('MCP timed out')), 15_000); }),
      ]);
      assert.equal(line.done, false);
      const response = JSON.parse(line.value!);
      assert.equal(response.id, id);
      assert.equal(response.error, undefined);
      return response.result;
    } finally { clearTimeout(timer); }
  };
  try {
    await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'local-only-test', version: '1' } });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    const listed = await rpc('tools/call', { name: 'bdesign_generation_models', arguments: {} });
    const models = listed.structuredContent.result as Array<{ id: string }>;
    assert.deepEqual(models.map(model => model.id).sort(), ['local-drama3', 'local-flux3-klein', 'local-h3', 'local-h3-ref2va']);
    const cloud = await rpc('tools/call', { name: 'bdesign_generation_model_get', arguments: { modelId: 'nano-banana-pro' } });
    assert.equal(cloud.isError, true);
    const local = await rpc('tools/call', { name: 'bdesign_generation_model_get', arguments: { modelId: 'local-flux3-klein' } });
    assert.equal(local.structuredContent.result.id, 'local-flux3-klein');
  } finally {
    lines.close();
    child.kill();
  }
});
