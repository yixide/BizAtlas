import { chromium, expect } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readMap } from './data.mjs';
const directory = process.argv[2] || 'examples/library/.bizatlas';
const map = readMap(directory);
const processFile = resolve(directory, 'process.json');
const proc = existsSync(processFile) ? JSON.parse(readFileSync(processFile, 'utf8')) : { modules: [] };
const baseURL = process.env.ATLAS_TEST_URL || 'http://127.0.0.1:5173';
const executablePath = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find(existsSync);
const browser = await chromium.launch(executablePath ? { executablePath, headless: true } : { headless: true });
const output = mkdtempSync(join(tmpdir(), 'atlas-ui-'));
const errors = [];
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', error => errors.push(error.message));
try {
  const response = await page.goto(baseURL);
  expect(response.status()).toBe(200);
  await expect(page.locator('.vue-flow__node')).toHaveCount(map.objects.length + map.domains.length);
  await page.screenshot({ path: join(output, 'overview.png'), animations: 'disabled' });

  // 搜索并从列表打开对象卡片
  const object = map.objects.find(o => o.importance === 'core') || map.objects[0];
  await page.locator('.list .search').fill(object.name);
  // 点行的左端：行中间是「收起」按钮
  await page.locator('.list .row').filter({ hasText: object.name }).first().click({ position: { x: 16, y: 12 } });
  await expect(page.locator('.district .d-title h2')).toContainText(object.name);
  await page.screenshot({ path: join(output, 'card.png'), animations: 'disabled' });

  // 逐个切换卡片页签（点已打开的页签会收起，所以倒着点）
  const tabs = page.locator('.district .d-tab');
  for (let i = await tabs.count() - 1; i >= 0; i--) {
    await tabs.nth(i).click();
    await expect(tabs.nth(i)).toHaveClass(/on/);
  }
  await page.keyboard.press('Escape');
  await page.locator('.list .search').fill('');

  // 流程图视图
  if (proc.modules.length) {
    await page.getByRole('tab', { name: /流程图/ }).click();
    await page.getByRole('button', { name: /个操作/ }).first().click();
    await expect(page.locator('.pv-op').first()).toBeVisible();
    await page.locator('.pv-op').first().click();
    await page.screenshot({ path: join(output, 'process.png'), animations: 'disabled' });
    await page.getByRole('tab', { name: /地图/ }).click();
  }

  // 架构图：点一个存储，详情面板列出连到它的节点
  if (existsSync(resolve(directory, 'architecture.json'))) {
    await page.getByRole('tab', { name: /架构图/ }).click();
    const node = page.locator('.av-node.store').first();
    await expect(node).toBeVisible();
    await node.click();
    await expect(page.locator('.av .pv-detail h3')).toBeVisible();
    await expect(page.locator('.av-node.on').first()).toBeVisible();
    await page.screenshot({ path: join(output, 'architecture.png'), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.locator('.av')).toHaveCount(0);
  }

  expect(errors).toEqual([]);
  const denied = await page.request.get(baseURL + '/.local/projects.json');
  expect(denied.status()).toBe(403);
  console.log(`浏览器验收通过：地图绘制、搜索、打开对象卡片、切换页签、流程图、架构图；截图目录 ${output}`);
} finally { await browser.close(); }
