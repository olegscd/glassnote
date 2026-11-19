// Glassnote smoke test — drives the real app in Edge/Chrome and fails on any JS error.
// Usage: npm test            (headless)
//        npm test -- --headed (watch it run)
// Browser: uses installed Microsoft Edge, then Chrome, then Playwright's Chromium
// (if you've run `npx playwright install chromium`). Override with GN_BROWSER=<path to exe>.
import { chromium } from 'playwright';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appUrl = pathToFileURL(path.join(root, 'glassnote.html')).href;
const shots = path.join(root, 'tests', 'screenshots');
mkdirSync(shots, { recursive: true });
const headed = process.argv.includes('--headed');

async function launch() {
  const opts = { headless: !headed };
  if (process.env.GN_BROWSER) return chromium.launch({ ...opts, executablePath: process.env.GN_BROWSER });
  for (const channel of ['msedge', 'chrome', undefined]) {
    try { return await chromium.launch({ ...opts, ...(channel ? { channel } : {}) }); } catch (_) {}
  }
  throw new Error('No browser found. Install Edge/Chrome, or run: npx playwright install chromium');
}

const errors = [];
let step = 'start';
const check = (cond, msg) => { if (!cond) throw new Error(`[${step}] ${msg}`); };

async function stroke(page, pts, holdMs = 0) {
  await page.mouse.move(...pts[0]); await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(...p);
  if (holdMs) await page.waitForTimeout(holdMs);
  await page.mouse.up();
}
const wave = (x, y, n = 100, amp = 18) => Array.from({ length: n }, (_, j) => [x + j * 3 + amp * Math.sin(j / 4), y + amp * Math.cos(j / 4)]);
const items = (page, pi = 0) => page.evaluate(i => cur.pages[i].items.map(it => it.type + ':' + (it.kind || it.st || it.tool || '')), pi);

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
page.on('pageerror', e => errors.push(`[${step}] ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errors.push(`[${step}] console: ${m.text()}`); });

try {
  step = 'load';
  await page.goto(appUrl);
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload(); await page.waitForTimeout(300);
  check(await page.locator('.nb:not(.new)').count() >= 2, 'library should show seeded notebooks');
  await page.screenshot({ path: path.join(shots, '01-library.png') });

  step = 'create paged notebook';
  await page.click('#newBtn'); await page.click('#menu button >> nth=0');
  await page.fill('#nbName', 'Smoke Test');
  await page.click('.pill:has-text("A4")');
  await page.click('#nbSave'); await page.waitForTimeout(300);
  check(await page.evaluate(() => cur.title === 'Smoke Test' && cur.size === 'a4' && cur.layout === 'paged'), 'notebook created with A4 pages');

  step = 'pens';
  const pens = await page.evaluate(() => db.pens.map(p => p.id));
  for (let i = 0; i < Math.min(4, pens.length); i++) {
    await page.evaluate(id => { ui.penId = id; renderToolbar(); }, pens[i]);
    await stroke(page, wave(360, 200 + i * 55));
  }
  check((await items(page)).filter(s => s.startsWith('ink')).length === Math.min(4, pens.length), 'one ink item per pen stroke');

  step = 'highlighter';
  await page.keyboard.press('h');
  await stroke(page, [[360, 440], [560, 442], [680, 440]]);

  step = 'hold-to-snap';
  await page.keyboard.press('p');
  await stroke(page, Array.from({ length: 40 }, (_, j) => [360 + j * 8, 490 + 6 * Math.sin(j)]), 700);
  await stroke(page, Array.from({ length: 22 }, (_, t) => [860 + 55 * Math.cos(t / 20 * 6.283), 240 + 55 * Math.sin(t / 20 * 6.283)]), 700);
  const snapped = (await items(page)).filter(s => s.startsWith('shape'));
  check(snapped.includes('shape:line') && snapped.includes('shape:ellipse'), 'held strokes snap to line + ellipse, got ' + snapped);

  step = 'shape tool';
  await page.keyboard.press('s'); await page.click('[data-kind=rect]');
  await stroke(page, [[800, 360], [860, 400], [920, 430]]);

  step = 'text';
  await page.keyboard.press('t'); await page.mouse.click(800, 500);
  await page.keyboard.type('Hello glass'); await page.mouse.click(1000, 620);
  check((await items(page)).includes('text:'), 'text item committed');
  await page.screenshot({ path: path.join(shots, '02-paged.png') });

  step = 'lasso + box select + move';
  const before = await page.evaluate(() => cur.pages[0].items.length);
  await page.keyboard.press('l');
  await stroke(page, [[780, 170], [950, 170], [950, 320], [780, 320], [782, 172]]);
  check(await page.evaluate(() => sel && sel.set.size === 1), 'lasso selects the circle');
  await stroke(page, [[860, 240], [880, 270], [900, 300]]);
  check(await page.evaluate(() => !sel.xf), 'move committed');
  await page.click('[data-lmode=box]');
  await stroke(page, [[780, 340], [940, 460]]);
  check(await page.evaluate(() => ui.lassoMode === 'box' && sel && sel.set.size >= 1), 'box selector selects items inside rect');
  await page.screenshot({ path: path.join(shots, '03-selection.png') });
  await page.click('[data-lmode=free]');

  step = 'precision eraser + stroke eraser + undo/redo';
  await page.keyboard.press('p');
  await stroke(page, Array.from({ length: 30 }, (_, j) => [360 + j * 10, 560]));
  const beforeSplit = await page.evaluate(() => cur.pages[0].items.length);
  await page.keyboard.press('e');
  await page.click('[data-emode=precision]');
  await stroke(page, [[500, 535], [500, 585]]);
  const afterSplit = await page.evaluate(() => cur.pages[0].items.length);
  check(afterSplit === beforeSplit + 1, `precision eraser should split 1 stroke into 2 (before=${beforeSplit}, after=${afterSplit})`);
  await page.keyboard.press('Control+z');
  check(await page.evaluate(() => cur.pages[0].items.length) === beforeSplit, 'undo restores split stroke');
  await page.click('[data-emode=stroke]');
  await page.click('[data-ehl="1"]');
  await stroke(page, [[500, 535], [500, 585]]);
  check(await page.evaluate(() => cur.pages[0].items.length) === beforeSplit, 'highlighter-only eraser leaves pen strokes intact');
  await page.click('[data-ehl="1"]');
  await stroke(page, [[500, 535], [500, 585]]);
  check(await page.evaluate(() => cur.pages[0].items.length) === before, 'whole-stroke eraser removes the stroke');
  await stroke(page, [[400, 170], [400, 260]]);
  const afterErase = await page.evaluate(() => cur.pages[0].items.length);
  check(afterErase < before, 'eraser removed something');
  await page.keyboard.press('Control+z');
  check(await page.evaluate(() => cur.pages[0].items.length) === before, 'undo restores erased strokes');
  await page.keyboard.press('Control+Shift+z');
  check(await page.evaluate(() => cur.pages[0].items.length) === afterErase, 'redo re-applies erase');

  step = 'pages + zoom';
  await page.click('#addPageBtn'); await page.click('#thumbsBtn'); await page.waitForTimeout(400);
  check(await page.evaluate(() => cur.pages.length) === 2, 'page added');
  await page.mouse.move(640, 400);
  await page.keyboard.down('Control'); await page.mouse.wheel(0, 200); await page.keyboard.up('Control');
  await page.mouse.wheel(0, 300); await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(shots, '04-zoom-thumbs.png') });

  step = 'reflow to scroll';
  await page.click('#titleBox'); await page.click('#pagePane .seg >> nth=0 >> button >> nth=1'); await page.click('[data-sheet=settings] .row-end .btn.primary'); await page.waitForTimeout(300);
  check(await page.evaluate(() => cur.layout === 'scroll' && cur.pages.length === 1), 'scroll layout has one page');
  await page.screenshot({ path: path.join(shots, '05-scroll.png') });

  step = 'reflow to board';
  await page.click('#titleBox'); await page.click('#pagePane .seg >> nth=0 >> button >> nth=2'); await page.click('[data-sheet=settings] .row-end .btn.primary'); await page.waitForTimeout(300);
  check(await page.evaluate(() => cur.layout === 'board' && cur.pages[0].items.length > 5), 'board keeps content');
  await page.keyboard.press('k'); await stroke(page, Array.from({ length: 25 }, (_, j) => [300 + j * 14, 650 + 18 * Math.sin(j / 3)]));
  await page.keyboard.down(' '); await page.mouse.move(640, 400); await page.mouse.down(); await page.mouse.move(500, 330, { steps: 5 }); await page.mouse.up(); await page.keyboard.up(' ');
  const camBeforeNav = await page.evaluate(() => ({ ox: cam.ox, oy: cam.oy }));
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  check(await page.evaluate(c => cam.ox < c.ox && cam.oy < c.oy, camBeforeNav), 'keyboard arrow keys pan the canvas');
  await page.keyboard.press('f'); await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(shots, '06-board.png') });

  step = 'page settings (custom paper colour)';
  await page.click('#titleBox'); await page.waitForTimeout(200);
  check(await page.locator('.pane[data-pane=page].on').count() === 1, 'title opens the Page settings pane');
  await page.click('#pagePane .seg button:has-text("Custom")');
  await page.locator('#pagePane .custom-tone input >> nth=0').fill('#fff4d6');
  check(await page.evaluate(() => cur.tone === 'custom' && cur.paperBg === '#fff4d6'), 'custom paper colour applied');
  await page.click('[data-sheet=settings] .row-end .btn.primary');

  step = 'tabs';
  await page.keyboard.press('p'); await stroke(page, wave(500, 420, 40));
  await page.click('#homeTab'); await page.waitForTimeout(200);
  check(await page.evaluate(() => cur === null && ui.tabs.length >= 1), 'home keeps the tab open');
  await page.click('.nb:has-text("Welcome")'); await page.waitForTimeout(200);
  check(await page.locator('.tab').count() >= 2, 'second tab opened');
  await page.click('.tab:has-text("Smoke Test")'); await page.waitForTimeout(200);
  check(await page.evaluate(() => cur.title === 'Smoke Test' && undoStack.length > 0), 'switching back keeps undo history');
  await page.screenshot({ path: path.join(shots, '06b-tabs.png') });

  step = 'side panel';
  const vw0 = await page.evaluate(() => vw);
  await page.keyboard.press('\\');
  await page.waitForTimeout(500);
  check(await page.evaluate(() => ui.panel.open && vw < innerWidth), 'panel opens and shrinks the canvas');
  await page.setInputFiles('#pFile', path.join(shots, '01-library.png'));
  await page.waitForTimeout(400);
  check(await page.locator('#pbody .pimg img').count() === 1, 'image shows in panel');
  const g = await page.locator('#pgrip').boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await page.mouse.down();
  await page.mouse.move(g.x - 150, g.y + g.height / 2, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(200);
  check(await page.evaluate(w0 => vw < w0 - 150 * 0.8, vw0 - 0) , 'dragging the grip widens the panel');
  await page.click('#pAdd'); await page.click('#menu button:has-text("web page")');
  await page.fill('#pUrl', 'example.com'); await page.press('#pUrl', 'Enter');
  check(await page.evaluate(() => ui.panel.docs.some(d => d.type === 'web' && d.url === 'https://example.com')), 'web doc created');
  await page.screenshot({ path: path.join(shots, '06c-panel.png') });
  await page.keyboard.press('\\'); await page.waitForTimeout(300);

  step = 'side-by-side notebook (pane B)';
  await page.keyboard.press('\\'); await page.waitForTimeout(300);
  await page.click('#pAdd'); await page.click('#menu button:has-text("side by side")'); await page.click('#menu button:has-text("Welcome")');
  await page.waitForTimeout(500);
  check(await page.evaluate(() => paneB.cur && paneB.cur.title === 'Welcome'), 'Welcome loaded in the side pane');
  const pb = await page.locator('#pbody .pstage').boundingBox();
  await page.keyboard.press('p');
  await stroke(page, Array.from({ length: 40 }, (_, j) => [pb.x + 60 + j * 4, pb.y + 200 + 15 * Math.sin(j / 4)]));
  check(await page.evaluate(() => activePane === paneB && cur.title === 'Welcome' && cur.pages[0].items.length >= 1), 'writing in the side pane edits Welcome');
  const mainBefore = await page.evaluate(() => paneA.cur.pages[0].items.length);
  await stroke(page, [[300, 300], [360, 340], [420, 300]]);
  check(await page.evaluate(n => activePane === paneA && cur.title === 'Smoke Test' && cur.pages[0].items.length === n + 1, mainBefore), 'writing on the left goes back to the main notebook');
  await page.screenshot({ path: path.join(shots, '06d-split.png') });

  step = 'panel float + dock left';
  const hd = await page.locator('#pmove').boundingBox();
  await page.mouse.move(hd.x + 10, hd.y + 12); await page.mouse.down();
  await page.mouse.move(600, 300, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(300);
  check(await page.evaluate(() => ui.panel.mode === 'float'), 'dragging the header floats the panel');
  await page.screenshot({ path: path.join(shots, '06e-float.png') });
  const hd2 = await page.locator('#pmove').boundingBox();
  await page.mouse.move(hd2.x + 10, hd2.y + 12); await page.mouse.down();
  await page.mouse.move(20, 400, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(400);
  check(await page.evaluate(() => ui.panel.mode === 'left' && parseFloat(getComputedStyle(document.getElementById('stage')).left) > 100), 'dropping on the left edge docks left');
  await page.click('#pAdd'); await page.click('#menu button:has-text("on the right")'); await page.waitForTimeout(300);
  await page.keyboard.press('\\'); await page.waitForTimeout(300);

  step = 'toolbar on top + lock zoom + fixed pressure';
  await page.click('#edSettings'); await page.click('#setTabs button:has-text("Pen")'); await page.click('#tbPosSeg button:has-text("Top")');
  await page.click('label.toggle:has-text("Constant pen width") input');
  await page.click('[data-sheet=settings] .row-end .btn.primary'); await page.waitForTimeout(300);
  check(await page.evaluate(() => document.getElementById('toolbar').getBoundingClientRect().top < 200), 'toolbar moved to the top');
  await page.keyboard.press('p'); await stroke(page, [[420, 300], [520, 300], [620, 300]]);
  check(await page.evaluate(() => { const it = cur.pages[0].items.at(-1); return it.type === 'ink' && it.th === 0 && it.ts === 0 && it.te === 0; }), 'fixed pressure produces uniform monoline stroke');
  const zBefore = await page.evaluate(() => cam.z);
  await page.click('[data-zoom=lock]');
  await page.click('[data-zoom="+"]');
  check(await page.evaluate(z => ui.zoomLock && Math.abs(cam.z - z) < 1e-6, zBefore), 'zoom lock blocks zoom changes');
  await page.click('[data-zoom=lock]');
  await page.screenshot({ path: path.join(shots, '06f-toolbar-top.png') });
  await page.click('#edSettings'); await page.click('#setTabs button:has-text("Pen")');
  await page.click('[data-rebind=right]'); await page.keyboard.press('d');
  check(await page.evaluate(() => db.settings.navKeys.right === 'd'), 'move key rebinds via keyboard press');
  await page.click('#navKeyBinds button:has-text("Reset")');
  await page.click('label.toggle:has-text("Constant pen width") input');
  await page.click('#tbPosSeg button:has-text("Bottom")'); await page.click('[data-sheet=settings] .row-end .btn.primary');

  step = 'write on a PDF';
  await page.click('#homeTab'); await page.waitForTimeout(200);
  await page.setInputFiles('#pdfFile', path.join(root, 'tests', 'fixtures', 'sample.pdf'));
  await page.waitForFunction(() => cur && cur.size === 'custom', null, { timeout: 30000 });
  await page.waitForTimeout(800);
  check(await page.evaluate(() => cur.pages.length === 2 && cur.pages.every(p => p.bg)), 'PDF imported as 2 pages with backgrounds');
  check((await page.textContent('#pageCount')).startsWith('Page 1 of 2'), 'page counter shows PDF pages');
  await page.keyboard.press('h'); await stroke(page, [[400, 250], [600, 252], [700, 250]]);
  check(await page.evaluate(() => cur.pages[0].items.length === 1), 'highlight on the PDF page');
  await page.screenshot({ path: path.join(shots, '06g-pdf.png') });

  step = 'dark mode + cute custom themes + assets';
  await page.click('#edSettings'); await page.click('#setTabs button:has-text("Theme")');
  await page.click('#themePresets .theme-tile:has-text("Snoopy")');
  await page.waitForTimeout(250);
  check(await page.evaluate(() => db.settings.scene === 'snoopy' && document.body.classList.contains('theme-snoopy') && !!document.querySelector('#wallArt img') && !!document.querySelector('#buddy img')), 'Snoopy Monochrome theme applies full monochrome UI, wallpaper & hot-air balloon buddy');
  await page.screenshot({ path: path.join(shots, '07c-snoopy.png') });
  await page.click('#themePresets .theme-tile:has-text("Dreamland")');
  await page.waitForTimeout(250);
  check(await page.evaluate(() => db.settings.scene === 'poyo' && !!document.querySelector('#buddy svg') && !!document.querySelector('#wallArt svg')), 'Dreamland theme renders pink puff buddy & sky art');
  await page.screenshot({ path: path.join(shots, '07b-dreamland.png') });
  await page.setInputFiles('#wallImgFile', path.join(shots, '01-library.png'));
  await page.setInputFiles('#buddyImgFile', path.join(shots, '01-library.png'));
  await page.waitForFunction(() => document.body.classList.contains('has-wall-img') && !!document.querySelector('#buddy img'), null, { timeout: 5000 });
  check(await page.evaluate(() => db.settings.wallImgId.startsWith('asset-') && db.settings.buddyImgId.startsWith('asset-')), 'custom wallpaper and corner sticker assets saved in IndexedDB');
  await page.click('#clearWallImg');
  await page.click('#clearBuddyImg');
  await page.waitForTimeout(150);
  check(await page.evaluate(() => !db.settings.wallImgId && !db.settings.buddyImgId && !document.body.classList.contains('has-wall-img')), 'custom assets cleared cleanly');
  await page.click('#themePresets .theme-tile:has-text("Sakura")');
  check(await page.evaluate(() => db.settings.accent === '#f45b84' && db.settings.wallBg === '#fff1f5' && db.settings.scene === 'sakura'), 'cute preset Sakura applies colours, base & scene');
  await page.fill('#customThemeName', 'Matcha Latte');
  await page.click('#saveCustomTheme');
  check(await page.evaluate(() => db.settings.customThemes.some(t => t.name === 'Matcha Latte')), 'custom theme saved');
  await page.click('#themePresets .theme-tile:has-text("Sunset")');
  await page.click('#customThemes .theme-tile:has-text("Matcha Latte")');
  check(await page.evaluate(() => db.settings.accent === '#f45b84'), 'clicking custom theme re-applies saved values');
  await page.click('#customThemes .theme-del');
  await page.click('#customThemes .theme-del.armed');
  check(await page.evaluate(() => db.settings.customThemes.length === 0), 'two-tap delete removes custom theme');
  await page.click('#resetTheme');
  await page.click('label.toggle:has-text("Dark mode") input');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(shots, '07-settings-dark.png') });
  await page.click('label.toggle:has-text("Dark mode") input');

  step = 'pen studio';
  await page.click('#setTabs button:has-text("Pen")'); await page.click('#openPens2'); await page.waitForTimeout(300);
  await page.click('#penList .pill >> nth=1');
  await stroke(page, Array.from({ length: 60 }, (_, j) => [300 + j * 5, 300 + 25 * Math.sin(j / 5)]));
  await page.locator('#penSliders input[type=range] >> nth=2').fill('0.8');
  await page.screenshot({ path: path.join(shots, '08-pen-studio.png') });
  await page.click('[data-sheet=pens] .btn.primary');

  step = 'google drive sync UI + merge';
  await page.click('#editor .syncBtn'); await page.waitForTimeout(200);
  check(await page.locator('.pane[data-pane=sync].on').count() === 1, 'sync button opens Sync pane');
  check(await page.locator('#syncFileWarn:not(.hidden)').count() === 1, 'file:// warning shows when opened directly');
  const mergeOk = await page.evaluate(() => {
    const now = Date.now();
    const local = {
      settings: { ...CONFIG.defaults, gdriveClientId: 'my-cid', accent: '#111111' },
      pens: clone(CONFIG.pens),
      ui: { ...db.ui, tabs: ['nb1', 'nbDel'] },
      notebooks: [
        { id: 'nb1', title: 'Local Old', cover: 0, layout: 'paged', size: 'letter', orient: 'portrait', paper: 'blank', tone: 'white', created: 1, updated: now - 5000, pages: [{ items: [] }] },
        { id: 'nbDel', title: 'Deleted Remote', cover: 0, layout: 'paged', size: 'letter', orient: 'portrait', paper: 'blank', tone: 'white', created: 1, updated: now - 5000, pages: [{ items: [] }] },
      ],
      deleted: {},
      settingsUpdated: now - 5000,
    };
    const remote = {
      settings: { ...CONFIG.defaults, accent: '#ff3b30' },
      pens: [...clone(CONFIG.pens), { id: 'remote-pen', name: 'Remote', style: 'smooth', size: 4, thinning: .3, streamline: .4, smoothing: .4, taperStart: 0, taperEnd: 0, speed: 0, opacity: 1 }],
      notebooks: [
        { id: 'nb1', title: 'Remote Newer', cover: 0, layout: 'paged', size: 'letter', orient: 'portrait', paper: 'blank', tone: 'white', created: 1, updated: now, pages: [{ items: [] }] },
        { id: 'nb2', title: 'From Other PC', cover: 1, layout: 'board', size: 'letter', orient: 'portrait', paper: 'dotted', tone: 'white', created: 2, updated: now, pages: [{ items: [] }] },
      ],
      deleted: { nbDel: now },
      settingsUpdated: now,
    };
    const m = mergeSyncData(local, remote);
    return m.notebooks.length === 2
      && m.notebooks.find(n => n.id === 'nb1').title === 'Remote Newer'
      && !!m.notebooks.find(n => n.id === 'nb2')
      && !m.notebooks.find(n => n.id === 'nbDel')
      && m.settings.accent === '#ff3b30'
      && m.settings.gdriveClientId === 'my-cid'
      && m.pens.some(p => p.id === 'remote-pen');
  });
  check(mergeOk, 'mergeSyncData merges notebooks, deletions, pens, and preserves clientId');
  await page.screenshot({ path: path.join(shots, '09-sync.png') });
  await page.click('[data-sheet=settings] .row-end .btn.primary');

  step = 'live collaborate UI + message sync';
  await page.click('#exportBtn'); await page.click('#menu button:has-text("Collaborate live")'); await page.waitForTimeout(200);
  check(await page.locator('.sheet[data-sheet=collab].active').count() === 1, 'collaborate sheet opens from share menu');
  const collabOk = await page.evaluate(() => {
    const p = parseCollabInput('https://demo.trycloudflare.com/glassnote.html#room=abc123');
    if (!p || p.room !== 'abc123' || p.relay !== 'https://demo.trycloudflare.com') return false;
    collab.nbId = cur.id;
    const beforeN = cur.pages[0].items.length;
    collabHandleMsg({ t: 'cur', from: 'p1', pi: 0, x: 200, y: 200, name: 'Alex' });
    collabHandleMsg({ t: 'delta', pi: 0, added: [{ id: 'rem1', type: 'text', x: 100, y: 100, text: 'Remote hi', size: 24, color: '#0a84ff' }], removed: [] });
    const afterAdd = cur.pages[0].items.length === beforeN + 1;
    collabHandleMsg({ t: 'delta', pi: 0, added: [], removed: ['rem1'] });
    const ok = collab.peers.has('p1') && afterAdd && cur.pages[0].items.length === beforeN;
    collab.peers.clear(); collab.nbId = '';
    return ok;
  });
  check(collabOk, 'live collaborate parses share links, applies remote page updates, and tracks peer cursors');
  await page.click('[data-sheet=collab] .row-end .btn.primary');

  step = 'persistence';
  await page.click('#backBtn'); await page.reload(); await page.waitForTimeout(300);
  check(await page.locator('.nb:has-text("Smoke Test")').count() === 1, 'notebook persisted after reload');
  check(await page.evaluate(() => ui.tabs.length >= 3 && ui.panel.docs.length === 3), 'tabs + panel docs persisted');

  check(errors.length === 0, 'page errors:\n' + errors.join('\n'));
  console.log('PASS — screenshots in tests/screenshots/');
} catch (e) {
  console.error('FAIL', e.message);
  if (errors.length) console.error(errors.join('\n'));
  await page.screenshot({ path: path.join(shots, 'failure.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
