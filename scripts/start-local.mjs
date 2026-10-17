import { spawn } from 'node:child_process';
import { openSync, closeSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = resolve(process.env.BEATDESIGN_DATA_DIR || resolve(root, 'data'));
mkdirSync(data, { recursive: true });
if (!existsSync(resolve(root, '.output/server/index.mjs')) || !existsSync(resolve(data, 'local-runtime.json'))) {
  throw new Error('Build the app and configure data/local-runtime.json first. See docs/LOCAL_MODELS.md.');
}
const env = { ...process.env, BEATDESIGN_GENERATION_PROVIDER: 'workstation', BEATDESIGN_ROOT: root,
  BEATDESIGN_DATA_DIR: data, HOST: '127.0.0.1', PORT: '3020', BEATDESIGN_MCP_HTTP_PORT: '3031' };
const runtime = JSON.parse(readFileSync(resolve(data, 'local-runtime.json'), 'utf8'));
if (runtime.ffmpeg) env.BEATDESIGN_FFMPEG = runtime.ffmpeg;
if (runtime.ffprobe) env.BEATDESIGN_FFPROBE = runtime.ffprobe;
const services = [
  { name: 'web', url: 'http://127.0.0.1:3020/api/ping', args: ['.output/server/index.mjs'] },
  { name: 'mcp', url: 'http://127.0.0.1:3031/mcp', args: ['node_modules/tsx/dist/cli.mjs', 'scripts/mcp-server.ts', '--http'] },
];
for (const service of services) {
  try {
    await fetch(service.url, { signal: AbortSignal.timeout(1500) });
    console.log(`${service.name}: port already responding; left unchanged.`);
    continue;
  } catch {}
  const out = openSync(resolve(data, `${service.name}.stdout.log`), 'a');
  const err = openSync(resolve(data, `${service.name}.stderr.log`), 'a');
  const child = spawn(process.execPath, service.args, { cwd: root, env, detached: true, windowsHide: true, stdio: ['ignore', out, err] });
  await new Promise((done, reject) => { child.once('spawn', done); child.once('error', reject); });
  child.unref(); closeSync(out); closeSync(err);
  writeFileSync(resolve(data, `${service.name}.pid.json`), JSON.stringify({ pid: child.pid, root, args: service.args }));
  console.log(`${service.name}: started (${child.pid})`);
}
console.log('BeatDesign: http://127.0.0.1:3020/\nCodex MCP: http://127.0.0.1:3031/mcp');
