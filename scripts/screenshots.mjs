// 用虚构示例重新生成 README 截图：先 npm run dev:example，再 node scripts/screenshots.mjs
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
const baseURL = process.env.ATLAS_TEST_URL || 'http://127.0.0.1:5173';
const out = 'docs/images';
mkdirSync(out, { recursive: true });
const executablePath = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find(existsSync);
const browser = await chromium.launch(executablePath ? { executablePath, headless: true } : { headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2, colorScheme: 'light' });
const shot = async name => { await page.waitForTimeout(600); await page.screenshot({ path: `${out}/${name}.png` }); console.log(`${out}/${name}.png`); };
const open = async name => {
  await page.locator('.list .search').fill(name);
  // 点行的左端：行中间是「收起」按钮，点到会把对象从地图上拿掉
  await page.locator('.list .row').filter({ hasText: name }).first().click({ position: { x: 16, y: 12 } });
  await page.locator('.list .search').fill('');
};
try {
  await page.goto(baseURL);
  await page.locator('.vue-flow__node').first().waitFor();
  await shot('overview');

  await open('借阅记录');
  await page.locator('.district').getByText('借还台').first().click();
  await page.mouse.move(1000, 840);
  // 卡片在全图里偏小，单独截卡片本身
  const card = async name => { await page.waitForTimeout(600); await page.locator('.district').screenshot({ path: `${out}/${name}.png` }); console.log(`${out}/${name}.png`); };
  await card('card-functions');

  // 馆藏册上下游都有，数据表页签更有代表性
  await page.keyboard.press('Escape');
  await open('馆藏册');
  await page.locator('.district .d-tab').filter({ hasText: '数据表' }).click();
  await page.mouse.move(1000, 840);
  await card('card-tables');
  await page.locator('.chip.table').filter({ hasText: '馆藏册' }).first().click();
  await shot('table-fields');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 1760, height: 820 });
  await page.getByRole('tab', { name: /流程图/ }).click();
  await page.getByTitle('收起列表').click();
  for (const m of await page.getByRole('button', { name: /个操作/ }).all()) await m.click();
  await page.locator('.pv-op').filter({ hasText: '办理借阅证' }).first().click();
  await shot('process');

  // 架构图：选中读者，看数据一路从哪来
  await page.getByRole('tab', { name: /架构图/ }).click();
  await page.locator('.av-node.user').filter({ hasText: '读者' }).first().click();
  await page.mouse.move(10, 810);
  await shot('architecture');
} finally { await browser.close(); }
