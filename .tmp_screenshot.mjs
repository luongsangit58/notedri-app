import { chromium } from 'playwright';

const OUT_DIR = '/tmp/claude-1001/-home-sangnl-Downloads-TMP-notedri-app/38b7a2af-4992-48b1-8e63-75d0139088e3/scratchpad';

const browser = await chromium.launch({ channel: 'chrome', executablePath: '/usr/bin/google-chrome' });
const context = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
const page = await context.newPage();
page.on('pageerror', (err) => console.log('[pageerror]', err.message));

await page.goto('http://localhost:19010', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(3000);

await page.getByText('Đăng nhập', { exact: true }).click();
await page.waitForTimeout(1500);
await page.getByPlaceholder('Email').fill('admin@notedri.sangtrang.com');
await page.getByPlaceholder('••••••••').fill('TempScreenshot2026!');
await page.getByText('Đăng nhập', { exact: true }).nth(1).click();
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT_DIR}/home_final2.png` });

await page.getByText('Thống kê', { exact: true }).click();
await page.waitForTimeout(2500);
await page.getByText('Báo cáo', { exact: true }).click();
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT_DIR}/report_final.png` });

await browser.close();
console.log('done');
