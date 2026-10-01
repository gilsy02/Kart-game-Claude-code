// Headless check that every track in TRACKS starts a race without page errors
// and that an AI kart can complete a lap (proof the layout is drivable).
// Physics is advanced through window.__game.step(n) so the result does not
// depend on the headless frame rate.
// Run: npm install && npm test   (uses the installed Google Chrome)
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = process.argv[2] || path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.hdr': 'application/octet-stream', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.png': 'image/png' };
const MAX_FRAMES = 60 * 90; // 90 s of game time per track

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  fs.readFile(path.join(ROOT, p), (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(0);

async function runTrack(browser, trackId) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // THREE_LOCAL=<three package dir> serves three.js from disk when the CDN is unreachable
  if (process.env.THREE_LOCAL) await page.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\//, route =>
    route.fulfill({ path: path.join(process.env.THREE_LOCAL, route.request().url().split(/three@[^/]+\//)[1].split('?')[0]), contentType: 'text/javascript' }));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::|youtube/i.test(m.text())) errors.push(m.text()); });
  const results = [];
  const record = (ok, msg) => results.push(`${ok ? 'PASS' : 'FAIL'} [${trackId}] ${msg}`);

  await page.goto(`http://localhost:${server.address().port}/`, { waitUntil: 'commit' });
  await page.waitForFunction(() => document.getElementById('start-btn')?.disabled === false, null, { timeout: 90000 });

  const hooks = await page.evaluate(() => Object.keys(window.__game).sort().join(','));
  record(/allKarts/.test(hooks) && /tracks/.test(hooks) && /waypoints/.test(hooks), `__game exposes tracks/allKarts/waypoints (${hooks})`);

  await page.$eval(`.theme-card[data-track="${trackId}"]`, e => e.click()); // DOM click: no frame wait on a slow software renderer
  const sel = await page.evaluate(() => window.__game.getTrack());
  record(sel === trackId, `track card selects track: ${sel}`);
  const themeActive = await page.$eval('.theme-card[data-theme].active', e => e.getAttribute('data-theme'));
  const wantTheme = await page.evaluate(id => window.__game.tracks[id].defaultTheme, trackId);
  record(themeActive === wantTheme, `default theme card follows track: ${themeActive}`);

  const wp = await page.evaluate(() => {
    const ys = window.__game.waypoints.map(p => p.y);
    return { n: window.__game.waypoints.length, minY: Math.min(...ys), maxY: Math.max(...ys), elevation: window.__game.elevation };
  });
  const wantN = await page.evaluate(id => window.__game.tracks[id].numWaypoints, trackId);
  record(wp.n === wantN, `waypoint count ${wp.n} (want ${wantN})`);
  if (trackId === 'village_highway' && wp.elevation > 0) record(wp.maxY >= 13 && wp.minY === 0, `elevation range ${wp.minY}..${wp.maxY.toFixed(1)} (want 0..>=13)`);
  else record(wp.maxY === 0 && wp.minY === 0, `flat track (y 0..${wp.maxY})`);

  await page.$eval('#start-btn', e => e.click());
  await page.waitForFunction(() => window.__game.getState() === 'RACING', null, { timeout: 15000 });
  record(true, 'race started');

  // Drive the AI forward in chunks until one of them finishes lap 1
  let frames = 0, best = 0;
  while (frames < MAX_FRAMES) {
    await page.evaluate(() => window.__game.step(600));
    frames += 600;
    best = await page.evaluate(() => Math.max(...window.__game.allKarts.filter(k => !k.isPlayer).map(k => k.lap)));
    if (best >= 2) break;
  }
  record(best >= 2, `an AI kart reached lap ${best} within ${frames} frames`);
  const stuck = await page.evaluate(() => window.__game.allKarts.filter(k => !k.isPlayer && k.lap < 2).map(k => `${k.name}@wp${k.currentWaypointIdx}`));
  record(true, `AI still on lap 1: ${stuck.length ? stuck.join(', ') : 'none'}`);

  // Every theme must build on this track without errors (props are re-placed along the road)
  const themes = await page.$$eval('.theme-card[data-theme]', els => els.map(e => e.getAttribute('data-theme')));
  for (const th of themes) {
    const before = errors.length;
    await page.$eval(`.theme-card[data-theme="${th}"]`, e => e.click());
    await page.evaluate(() => window.__game.step(60));
    const propCount = await page.evaluate(() => { let n = 0; window.__game.scene.traverse(o => { if (o.isMesh) n++; }); return n; });
    record(errors.length === before, `theme ${th} on ${trackId}: ${propCount} meshes, ${errors.length - before} new errors`);
  }

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
  for (const id of ['oval', 'village_highway']) results.push(...await runTrack(browser, id));
  console.log(results.join('\n'));
  const fails = results.filter(r => r.startsWith('FAIL')).length;
  console.log(`${results.length - fails}/${results.length} passed`);
  await browser.close();
  server.close();
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(2); });
