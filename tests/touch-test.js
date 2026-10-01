// Headless mobile check for the touch controls (slide between buttons, N2O tap),
// run once per UI language (KR / US / MX).
// Run: npm install && npm test   (uses the installed Google Chrome)
// Optional: node tests/touch-test.js <other game dir>  to test another copy.
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = process.argv[2] || path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.png': 'image/png' };
// Expected UI strings per language (I18N startBtnReady / goText in index.html)
const LANGS = {
  kr: { start: '게임 시작 (START RACE)', go: '출발!' },
  us: { start: 'START RACE', go: 'GO!' },
  mx: { start: 'INICIAR CARRERA', go: '¡VAMOS!' },
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  fs.readFile(path.join(ROOT, p), (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(0);

async function runLang(browser, lang) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // THREE_LOCAL=<three package dir> serves three.js from disk when the CDN is unreachable
  if (process.env.THREE_LOCAL) await page.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\//, route =>
    route.fulfill({ path: path.join(process.env.THREE_LOCAL, route.request().url().split(/three@[^/]+\//)[1].split('?')[0]), contentType: 'text/javascript' }));
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const active = () => page.$$eval('.touch-btn.active', els => els.map(e => e.id.replace('btn-touch-', '')).sort().join(','));
  const center = async sel => { const b = await page.locator(sel).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };
  const results = [];
  const record = (ok, msg) => results.push(`${ok ? 'PASS' : 'FAIL'} [${lang}] ${msg}`);
  const check = async (name, want) => {
    const got = await active();
    record(got === want, `${name}: got [${got}] want [${want}]`);
  };
  const text = sel => page.$eval(sel, e => e.textContent.trim());

  // Don't wait for 'load': the page pulls the YouTube API and three.js from the network,
  // which can stall past 30s. The enabled start button is the real "ready" signal.
  await page.goto(`http://localhost:${server.address().port}/`, { waitUntil: 'commit' });
  await page.waitForFunction(() => document.getElementById('start-btn')?.disabled === false, null, { timeout: 90000 });
  const layerDisplay = () => page.$eval('#mobile-touch-layer', e => getComputedStyle(e).display);
  record(await layerDisplay() === 'none', `touch buttons hidden on start screen`);
  // Real tap: in landscape (844x390) the switcher must be inside the viewport
  const langBtn = page.locator(`.lang-btn[data-lang="${lang}"]`);
  const lb = await langBtn.boundingBox();
  record(lb && lb.y >= 0 && lb.y + lb.height <= 390, `language switcher on screen (y=${lb && lb.y.toFixed(0)})`);
  await langBtn.tap();
  const startText = await text('#start-btn');
  record(startText === LANGS[lang].start, `language applied: start button "${startText}"`);
  const hintShown = await page.$eval('.touch-hint', e => getComputedStyle(e).display !== 'none' && e.textContent.includes('DRIFT'));
  const kbHintHidden = await page.$eval('.controls-hint', e => getComputedStyle(e).display === 'none');
  record(hintShown && kbHintHidden, `touch control hint shown, keyboard hint hidden`);
  const fsLabel = await text('#fs-btn-start');
  record(fsLabel.includes('[F]') && (lang === 'kr') === /[가-힣]/.test(fsLabel), `fullscreen button in ${lang}: "${fsLabel}"`);

  // Headless can't really go fullscreen: stub the request and check START asks for it on touch devices
  await page.evaluate(() => { document.documentElement.requestFullscreen = () => { window.__fsRequested = true; return Promise.resolve(); }; });
  await page.tap('#start-btn');
  record(await page.evaluate(() => window.__fsRequested === true), `START requests fullscreen on touch device`);
  // "GO" class is set together with gameState = 'RACING'; the overlay may already be hidden
  await page.waitForSelector('.countdown-num.go', { state: 'attached', timeout: 15000 });
  const goText = await text('.countdown-num.go');
  record(goText === LANGS[lang].go, `countdown go text "${goText}"`);
  await page.waitForTimeout(300);
  record(await layerDisplay() === 'block', `touch buttons shown while racing`);
  const idleBubble = await text('#hud-speech-bubble');
  record(lang === 'kr' ? /[가-힣]/.test(idleBubble) : !/[가-힣]/.test(idleBubble), `bubble in ${lang}: "${idleBubble}"`);

  const L = await center('#btn-touch-left'), R = await center('#btn-touch-right');
  const drift = await center('#btn-touch-drift'), n2o = await center('#btn-touch-boost');
  record(!(await page.$('#btn-touch-gas')) && !(await page.$('#btn-touch-brake')), `no gas / brake pedals on touch layout`);
  const kmh = () => page.evaluate(() => Math.round(window.__game.allKarts[0].forwardSpeed * 216));
  const step = n => page.evaluate(n => window.__game.step(n), n);
  const reversing = () => page.$eval('#btn-touch-drift', e => e.classList.contains('reversing'));
  const gapMid = (L.b.x + L.b.width + R.b.x) / 2;

  // Slide steering
  await touch('touchStart', [[L.x, L.y]]);              await check('press left', 'left');
  await touch('touchMove', [[R.x, R.y]]);               await check('slide to right', 'right');
  await touch('touchMove', [[R.x, R.b.y + R.b.height + 20]]); await check('drift 20px below right', 'right');
  await touch('touchMove', [[gapMid - 3, L.y]]);        await check('gap, left of center', 'left');
  await touch('touchMove', [[gapMid + 3, L.y]]);        await check('gap, right of center', 'right');
  await touch('touchMove', [[422, 150]]);               await check('slide off to screen middle', '');
  await touch('touchEnd', []);                           await check('release', '');

  // Two fingers: steer + drift
  await touch('touchStart', [[L.x, L.y], [drift.x, drift.y]]); await check('left + drift', 'drift,left');
  await touch('touchEnd', []);                                   await check('release both', '');

  // Auto accelerate: no button held, the kart still drives off
  await step(45);
  const autoKmh = await kmh();
  record(autoKmh > 40, `auto accelerate with no buttons: ${autoKmh} km/h after 45 frames`);
  // Long-press DRIFT without steering: brake, then reverse until released.
  // Kept within the first ~120 frames: after that the kart reaches the first curve and hits the wall.
  await touch('touchStart', [[drift.x, drift.y]]);
  await step(30);
  record(!(await reversing()) && (await kmh()) > 60, `DRIFT held 30 frames: still driving (${await kmh()} km/h)`);
  await step(40);
  record(await reversing(), `DRIFT held 70 frames: reverse mode on`);
  await step(120);
  const revKmh = await kmh();
  record(revKmh < 0, `reversing: ${revKmh} km/h`);
  await touch('touchEnd', []);
  await step(60);
  record(!(await reversing()) && (await kmh()) > revKmh + 20, `DRIFT released: forward again (${await kmh()} km/h)`);
  // DRIFT + steering never enters reverse
  await touch('touchStart', [[L.x, L.y], [drift.x, drift.y]]);
  await step(120);
  record(!(await reversing()), `DRIFT + steer 120 frames: no reverse`);
  await touch('touchEnd', []);

  // N2O tap starts boost
  const readyBefore = await page.$eval('#booster-card-1', e => e.classList.contains('ready'));
  await touch('touchStart', [[n2o.x, n2o.y]]);
  await page.waitForTimeout(120);
  await touch('touchEnd', []);
  await page.waitForTimeout(400);
  const b = await text('#hud-speech-bubble');
  const readyAfter = await page.$eval('#booster-card-1', e => e.classList.contains('ready'));
  record(readyBefore && !readyAfter && b.includes('N2O'), `N2O tap: card ready ${readyBefore}->${readyAfter}, bubble "${b}"`);

  record(!errors.length, `page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
  await ctx.close();
  return results;
}

(async () => {
  // PW_CHROME=<path> runs another Chromium build (e.g. a sandbox without Google Chrome)
  const launch = { channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] };
  if (process.env.PW_CHROME) { delete launch.channel; launch.executablePath = process.env.PW_CHROME; }
  const browser = await chromium.launch(launch);
  const results = [];
  for (const lang of Object.keys(LANGS)) results.push(...await runLang(browser, lang));
  console.log(results.join('\n'));
  const fails = results.filter(r => r.startsWith('FAIL')).length;
  console.log(`${results.length - fails}/${results.length} passed`);
  await browser.close();
  server.close();
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(2); });
