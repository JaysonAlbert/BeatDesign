import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

const directory = await mkdtemp(join(tmpdir(), 'beatdesign-e2e-'));
const env = {
  ...process.env,
  BEATDESIGN_DATA_DIR: directory,
  BEATDESIGN_MCP_HTTP_PORT: '3043',
  BEATDESIGN_MCP_TOKEN: 'e2e-local-only',
};
const children = [];
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
};
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, stop);
try {
  execFileSync(
    process.execPath,
    ['node_modules/drizzle-kit/bin.cjs', 'push', '--force'],
    { env, stdio: 'inherit', windowsHide: true }
  );
  execFileSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/seed-organization-fixture.ts'],
    { env, stdio: 'inherit', windowsHide: true }
  );
  children.push(
    spawn(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        '--host',
        '127.0.0.1',
        '--port',
        '3042',
        '--strictPort',
      ],
      { env, stdio: 'inherit', windowsHide: true }
    ),
    spawn(
      process.execPath,
      ['--import', 'tsx', 'scripts/mcp-server.ts', '--http'],
      { env, stdio: 'inherit', windowsHide: true }
    )
  );
  for (const child of children) child.once('exit', stop);
  await Promise.all(
    children.map(
      (child) =>
        new Promise((resolveExit, reject) => {
          child.once('exit', resolveExit);
          child.once('error', reject);
        })
    )
  );
} finally {
  stop();
  await Promise.all(
    children
      .filter((child) => child.exitCode === null && child.signalCode === null)
      .map((child) => new Promise((done) => child.once('exit', done)))
  );
  if (dirname(resolve(directory)) !== resolve(tmpdir()))
    throw new Error('Unexpected E2E cleanup directory');
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
}
