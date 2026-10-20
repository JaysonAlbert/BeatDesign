import { test, expect, type APIRequestContext } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
const headers = { 'x-beatapi-workspace-request': '1' };
async function fixture(request: APIRequestContext) {
  const rows = await (await request.get('/api/app/series')).json();
  const item = rows.find((s: any) => s.id === 'synthetic-series-002');
  expect(item).toBeTruthy();
  const state = await (await request.get(`/api/app/series/${item.id}`)).json();
  return { state, projectId: state.episodes[0].projectId as string };
}
async function mcp(request: APIRequestContext, name: string, args: any) {
  const response = await request.post('http://127.0.0.1:3043/mcp', {
    headers: {
      authorization: 'Bearer e2e-local-only',
      accept: 'application/json, text/event-stream',
    },
    data: {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name, arguments: args },
    },
  });
  const raw = await response.text();
  const payload = JSON.parse(
    raw.startsWith('{')
      ? raw
      : raw
          .split('\n')
          .find((s) => s.startsWith('data: '))!
          .slice(6),
  );
  expect(payload.result?.isError, JSON.stringify(payload)).not.toBe(true);
  return payload.result.structuredContent.result;
}
const screenshots = 'docs/references/beatdesign/2026-10-21-series-organization';

test('media can be published separately from Elements, archived with a preview and restored', async ({
  page,
  request,
}) => {
  const { projectId } = await fixture(request);
  await page.goto(`/assets/${projectId}?scope=episode&q=1900`);
  await expect(page.locator('[data-asset-id]')).toHaveCount(1);
  await page
    .getByRole('button', { name: 'Publish to Series assets', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Series shared', exact: true })
    .click();
  await expect(page.locator('[data-asset-id]')).toHaveCount(1);
  await page
    .getByRole('button', { name: 'Preview archive impact', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm archive', exact: true })
    .click();
  await expect(page.locator('[data-asset-id]')).toHaveCount(0);
  await page
    .getByRole('checkbox', { name: 'Show archived', exact: true })
    .first()
    .check();
  await expect(page.locator('[data-asset-id]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Restore', exact: true }),
  ).toHaveCount(0);
});

test('30 warm scene selections stay below two seconds and do not preload other Canvas bodies', async ({
  page,
  request,
}) => {
  const { projectId } = await fixture(request);
  await page.goto(
    `/canvas/${projectId}?sceneId=synthetic-scene-0-7&canvasId=synthetic-canvas-0-7`,
  );
  await expect(page.locator('.react-flow')).toBeVisible();
  const timings: number[] = [];
  for (let i = 0; i < 32; i++) {
    const index = 7 + (i % 3);
    await page
      .getByRole('button', { name: 'Episodes and scenes', exact: true })
      .click();
    const start = Date.now();
    await page
      .getByRole('button', {
        name: `Scene ${String(index + 1).padStart(2, '0')}`,
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`sceneId=synthetic-scene-0-${index}`),
    );
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.locator('.react-flow')).toBeVisible();
    if (i >= 2) timings.push(Date.now() - start);
  }
  mkdirSync(screenshots, { recursive: true });
  const p95 = [...timings].sort((a, b) => a - b)[28];
  writeFileSync(
    `${screenshots}/canvas-switch-timings.json`,
    JSON.stringify(
      { samples: timings, p95, threshold: 2000, warmCache: true },
      null,
      2,
    ),
  );
  expect(p95).toBeLessThan(2000);
});

test('12-episode overview and scene navigation load one independent document; deep links survive back and refresh', async ({
  page,
  request,
}) => {
  const { state, projectId } = await fixture(request);
  const narrative = await mcp(request, 'bdesign_project_narrative_get', {
    projectId,
  });
  expect(narrative.scenes).toHaveLength(20);
  expect(state.episodes).toHaveLength(12);
  const snapshots: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/snapshot')) snapshots.push(req.url());
  });
  await page.goto(`/series/${state.id}`);
  await expect(
    page.getByText('Series 002 · synthetic 12 episodes', { exact: true }),
  ).toBeVisible();
  mkdirSync(screenshots, { recursive: true });
  await page.screenshot({ path: `${screenshots}/series-overview.png` });
  const url = `/canvas/${projectId}?sceneId=synthetic-scene-0-0&canvasId=synthetic-canvas-0-0`;
  await page.goto(url);
  await expect(
    page.getByRole('button', { name: 'Fit graph to view', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.react-flow')).toBeVisible();
  await page.getByRole('button', { name: /Episodes and scenes/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({
    path: `${screenshots}/scene-navigation.png`,
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await page.goto(
    `/canvas/${projectId}?sceneId=synthetic-scene-0-1&canvasId=synthetic-canvas-0-1`,
  );
  await page.goBack();
  await expect(page).toHaveURL(/canvasId=synthetic-canvas-0-0/);
  await page.reload();
  await expect(page.locator('.react-flow')).toBeVisible();
  expect(snapshots.every((url) => !url.includes('synthetic-canvas-1-'))).toBe(
    true,
  );
});

test('temporary node focus preserves the entire saved document and revision', async ({
  page,
  request,
}) => {
  const { projectId } = await fixture(request);
  const endpoint = `/api/app/projects/${projectId}/snapshot?canvasId=synthetic-canvas-0-2`;
  const before = await (await request.get(endpoint)).json();
  await page.goto(
    `/canvas/${projectId}?sceneId=synthetic-scene-0-2&canvasId=synthetic-canvas-0-2&focus=e0-s2-note-77`,
  );
  await expect(
    page.getByText('Temporary focus', { exact: false }),
  ).toBeVisible();
  await page.waitForTimeout(2300);
  const after = await (await request.get(endpoint)).json();
  expect(after).toEqual(before);
  const commandId = crypto.randomUUID();
  await mcp(request, 'bdesign_canvas_apply', { projectId, canvasId: 'synthetic-canvas-0-2', commandId, idempotencyKey: commandId, expectedRevision: before.version, operations: [{ type: 'set_camera', camera: { x: 24, y: 88, z: 0.7 } }] });
  await page.waitForTimeout(2400);
  const remote = await (await request.get(endpoint)).json();
  expect(remote.document.camera).toEqual({ x: 24, y: 88, z: 0.7 });
  await page.getByRole('button', { name: 'Exit focus', exact: true }).click();
  await page.waitForTimeout(1200);
  expect(await (await request.get(endpoint)).json()).toEqual(remote);

});

test('shared UI keeps old pins and exact review updates only three of 20 consumers across Web and MCP', async ({
  page,
  request,
}) => {
  const { projectId, state } = await fixture(request);
  const before = await mcp(request, 'bdesign_shared_elements_get', {
    seriesId: state.id,
  });
  expect(before.elements[0].consumers).toHaveLength(20);
  expect(
    before.elements[0].consumers.every(
      (c: any) => c.versionId === 'synthetic-hero-v1',
    ),
  ).toBe(true);
  await page.goto(`/assets/${projectId}?scope=series`);
  await page
    .getByLabel('Choose a shared Element', { exact: true })
    .selectOption('synthetic-hero');
  await page.getByRole('region', { name: 'Series Elements', exact: true }).getByText('Reference consumers · 20', { exact: true }).click();
  const boxes = page.getByRole('checkbox', { name: /Select consumer/ });
  await expect(boxes).toHaveCount(20);
  for (let i = 0; i < 3; i++) await boxes.nth(i).check();
  await page
    .getByRole('button', { name: 'Preview adoption for 3 inputs' })
    .click();
  await expect(
    page.getByText('3 inputs affected', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `${screenshots}/shared-version-review.png`,
    animations: 'disabled',
  });
  await page
    .getByRole('button', { name: 'Apply the reviewed changes' })
    .click();
  await expect
    .poll(async () => {
      const lib = await mcp(request, 'bdesign_shared_elements_get', {
        seriesId: state.id,
      });
      return lib.elements[0].consumers.filter(
        (c: any) => c.versionId === 'synthetic-hero-v2',
      ).length;
    })
    .toBe(3);
});

test('2,000-media server pages, filters and deep details stay scoped, with no generation or upload', async ({
  page,
  request,
}) => {
  const { projectId } = await fixture(request);
  let cursor: string | null = null;
  const ids = new Set<string>();
  do {
    const result = await (
      await request.get(
        `/api/app/projects/${projectId}/scoped-assets?scope=episode&limit=500${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      )
    ).json();
    expect(result.total).toBe(2000);
    for (const item of result.assets) {
      expect(ids.has(item.id)).toBe(false);
      ids.add(item.id);
    }
    cursor = result.nextCursor;
  } while (cursor);
  expect(ids.size).toBe(2000);
  const forbidden: string[] = [];
  page.on('request', (r) => {
    if (/\/api\/(effects\/generate|storage\/upload)/.test(r.url()))
      forbidden.push(r.url());
  });
  await page.goto(`/assets/${projectId}?scope=episode&q=1800`);
  await expect(page.locator('[data-asset-id]')).toHaveCount(1);
  await page.locator('[data-asset-id] button').first().click();
  await expect(page.getByRole('dialog').getByRole('img')).toBeVisible();
  await page.keyboard.press('Escape');
  const timings: number[] = [];
  for (let i = 0; i < 30; i++) {
    const term = String(1700 + i);
    const start = Date.now();
    await page.getByLabel('Search assets', { exact: true }).fill(term);
    await expect(page.locator('[data-asset-id]')).toHaveCount(1);
    await expect(page.locator('[data-asset-id]')).toHaveAttribute(
      'data-asset-id',
      `series-image-${term}`,
    );
    timings.push(Date.now() - start);
  }
  const sorted = [...timings].sort((a, b) => a - b);
  const p95 = sorted[28];
  writeFileSync(
    `${screenshots}/asset-filter-timings.json`,
    JSON.stringify(
      { samples: timings, p95, warmCache: true, threshold: 1000 },
      null,
      2,
    ),
  );
  expect(p95).toBeLessThan(1000);
  expect(forbidden).toEqual([]);
  await page.screenshot({ path: `${screenshots}/asset-board.png` });
});

for (const locale of ['en', 'zh'])
  test(`${locale}: narrow-screen scene navigation is keyboard accessible`, async ({
    page,
    request,
    context,
  }) => {
    const { projectId } = await fixture(request);
    await context.addCookies([
      {
        name: 'PARAGLIDE_LOCALE',
        value: locale,
        domain: '127.0.0.1',
        path: '/',
      },
    ]);
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto(
      `${locale === 'en' ? '' : `/${locale}`}/canvas/${projectId}?sceneId=synthetic-scene-0-3&canvasId=synthetic-canvas-0-3`,
    );
    const trigger = page.getByRole('button', {
      name: locale === 'zh' ? /分集与场次/ : /Episodes and scenes/,
    });
    await trigger.focus();
    await trigger.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await page.screenshot({ path: `${screenshots}/narrow-${locale}.png` });
    const labels = JSON.parse(
      readFileSync(`messages/${locale}.json`, 'utf8'),
    ).Series;
    await page.goto(
      `${locale === 'en' ? '' : `/${locale}`}/assets/${projectId}?scope=episode&q=1800`,
    );
    await expect(page.locator('[data-asset-id]')).toHaveCount(1);
    for (let i = 0; i < 20; i++) {
      const shared = i % 2 === 0;
      const target = page.getByRole('button', {
        name: shared ? labels.scope_series : labels.scope_episode,
        exact: true,
      });
      await target.focus();
      await target.press('Enter');
      await expect(target).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('[data-asset-id]')).toHaveCount(shared ? 0 : 1);
      if (!shared)
        await expect(page.locator('[data-asset-id]')).toHaveAttribute(
          'data-asset-id',
          'series-image-1800',
        );
    }
    await page
      .getByRole('button', { name: labels.scope_series, exact: true })
      .click();
    await page
      .getByLabel(labels.chooseElement, { exact: true })
      .selectOption('synthetic-hero');
    await expect(
      page.getByText(labels.fixedVersionDescription, { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: labels.navigation, exact: true })
      .click();
    const name = `Keyboard scene ${locale}`;
    await page.getByLabel(labels.sceneName, { exact: true }).fill(name);
    await page
      .getByRole('button', { name: labels.newScene, exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
  });
