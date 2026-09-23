// Headless mobile check for the touch controls (slide between buttons, N2O tap).
// Run: npm install && npm test   (uses the installed Google Chrome)
// Optional: node tests/touch-test.js <other game dir>  to test another copy.
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = process.argv[2] || path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  fs.readFile(path.join(ROOT, p), (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(0);

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const active = () => page.$$eval('.touch-btn.active', els => els.map(e => e.id.replace('btn-touch-', '')).sort().join(','));
  const center = async sel => { const b = await page.locator(sel).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };
  const results = [];
  const check = async (name, want) => {
    const got = await active();
    results.push(`${got === want ? 'PASS' : 'FAIL'} ${name}: got [${got}] want [${want}]`);
  };

  // Don't wait for 'load': the page pulls the YouTube API and three.js from the network,
  // which can stall past 30s. The enabled start button is the real "ready" signal.
  await page.goto(`http://localhost:${server.address().port}/`, { waitUntil: 'commit' });
  await page.waitForFunction(() => document.getElementById('start-btn')?.disabled === false, null, { timeout: 90000 });
  await page.tap('#start-btn');
  // "GO" class is set together with gameState = 'RACING'; the overlay may already be hidden
  await page.waitForSelector('.countdown-num.go', { state: 'attached', timeout: 15000 });
  await page.waitForTimeout(300);

  const L = await center('#btn-touch-left'), R = await center('#btn-touch-right');
  const gas = await center('#btn-touch-gas'), brake = await center('#btn-touch-brake'), n2o = await center('#btn-touch-boost');
  const gapMid = (L.b.x + L.b.width + R.b.x) / 2;

  // Slide steering
  await touch('touchStart', [[L.x, L.y]]);              await check('press left', 'left');
  await touch('touchMove', [[R.x, R.y]]);               await check('slide to right', 'right');
  await touch('touchMove', [[R.x, R.b.y + R.b.height + 20]]); await check('drift 20px below right', 'right');
  await touch('touchMove', [[gapMid - 3, L.y]]);        await check('gap, left of center', 'left');
  await touch('touchMove', [[gapMid + 3, L.y]]);        await check('gap, right of center', 'right');
  await touch('touchMove', [[422, 150]]);               await check('slide off to screen middle', '');
  await touch('touchEnd', []);                           await check('release', '');

  // Two fingers: steer + pedal, slide pedal finger gas -> brake
  await touch('touchStart', [[L.x, L.y], [gas.x, gas.y]]);   await check('left + gas', 'gas,left');
  await touch('touchMove', [[L.x, L.y], [brake.x, brake.y]]); await check('slide gas -> brake', 'brake,left');
  await touch('touchEnd', []);                                 await check('release both', '');

  // N2O tap starts boost
  const bubble = () => page.$eval('#hud-speech-bubble', e => e.textContent);
  const readyBefore = await page.$eval('#booster-card-1', e => e.classList.contains('ready'));
  await touch('touchStart', [[n2o.x, n2o.y]]);
  await page.waitForTimeout(120);
  await touch('touchEnd', []);
  await page.waitForTimeout(400);
  const b = await bubble();
  const readyAfter = await page.$eval('#booster-card-1', e => e.classList.contains('ready'));
  results.push(`${readyBefore && !readyAfter && b.includes('N2O') ? 'PASS' : 'FAIL'} N2O tap: card ready ${readyBefore}->${readyAfter}, bubble "${b}"`);

  results.push(`${errors.length ? 'FAIL' : 'PASS'} page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
  console.log(results.join('\n'));
  await browser.close();
  server.close();
  process.exitCode = results.some(r => r.startsWith('FAIL')) ? 1 : 0;
})().catch(e => { console.error(e); process.exit(2); });
