import { chromium } from 'playwright';

const OUT_DIR = '/tmp/claude-1001/-home-sangnl-Downloads-TMP-notedri-app/38b7a2af-4992-48b1-8e63-75d0139088e3/scratchpad';

const browser = await chromium.launch({ channel: 'chrome', executablePath: '/usr/bin/google-chrome' });
const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
const page = await context.newPage();
page.on('console', (msg) => console.log('[console]', msg.type(), msg.text()));
page.on('pageerror', (err) => console.log('[pageerror]', err.message));
page.on('requestfailed', (req) => console.log('[requestfailed]', req.url(), req.failure()?.errorText));

await page.goto('http://localhost:19010', { waitUntil: 'load', timeout: 60000 });
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(2000);
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 200));
  const rootHtmlLen = await page.evaluate(() => document.getElementById('root')?.innerHTML?.length ?? -1);
  console.log(`tick ${i}: rootHtmlLen=${rootHtmlLen} bodyText=${JSON.stringify(bodyText)}`);
}
await page.screenshot({ path: `${OUT_DIR}/diag.png`, fullPage: true });
await browser.close();
