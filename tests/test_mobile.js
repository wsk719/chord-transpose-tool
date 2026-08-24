// 手機版面／觸控手勢驗證：用 jsdom 載入頁面，stub canvas 與版面尺寸，直接驅動 pointer handler
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// 用法：node tests/test_mobile.js [要測的 html，預設為原始碼；也可傳 docs/index.html]
const SRC = process.argv[2] || path.join(__dirname, '..', '和弦轉調工具.html');
let html = fs.readFileSync(SRC, 'utf8');
// 移除三個 CDN <script>（沙箱無外網，且測試不需要）
html = html.replace(/<script src="https:\/\/[^"]+"><\/script>\n?/g, '');

let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) { passes++; } else { fails++; console.log('  ✗ ' + msg); } };

// JSDOM 建構時就會執行 <script>，來不及事後 stub，
// 所以先建立空白 DOM、裝好 stub，再把頁面內容與 script 注入進去。
function bootAndRun(opts) {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>',
    { runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window, d = w.document;
  w.matchMedia = q => ({ matches: /coarse/.test(q) ? opts.coarse : false, media: q,
    addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
  Object.defineProperty(w, 'innerWidth',  { value: opts.vw, configurable: true });
  Object.defineProperty(w, 'innerHeight', { value: opts.vh, configurable: true });
  w.__pageScrollY = 0;
  w.scrollBy = (_x, y) => { w.__pageScrollY += y; };
  w.prompt = opts.prompt || (() => null);
  w.alert = () => {};
  const ctx2d = new Proxy({}, { get: (t, k) =>
    k === 'measureText' ? (s => ({ width: String(s).length * 8 })) :
    k === 'canvas' ? {} : (() => {}) });
  w.HTMLCanvasElement.prototype.getContext = () => ctx2d;

  // 注入頁面的 body/head 內容（含 <script>）
  const parsed = new JSDOM(html).window.document;
  d.head.innerHTML = parsed.head.innerHTML.replace(/<script[\s\S]*?<\/script>/g, '');
  const bodyHtml = parsed.body.innerHTML;
  const scriptSrc = /<script>([\s\S]*)<\/script>/.exec(bodyHtml)[1];
  d.body.innerHTML = bodyHtml.replace(/<script>[\s\S]*<\/script>/, '');
  const s = d.createElement('script');
  s.textContent = scriptSrc;
  d.body.appendChild(s);
  return { dom, w, d };
}

function stubLayout(w, d, { wrapW, wrapMaxH, imgW, imgH }) {
  const canvas = d.getElementById('imgCanvas');
  const wrap = d.getElementById('canvasWrap');
  canvas.width = imgW; canvas.height = imgH;
  Object.defineProperty(wrap, 'clientWidth', { value: wrapW, configurable: true });
  // getComputedStyle 在 jsdom 讀不到 media query，直接覆寫
  const real = w.getComputedStyle.bind(w);
  w.getComputedStyle = el => el === wrap
    ? { paddingLeft: '0px', paddingRight: '0px', maxHeight: wrapMaxH + 'px' }
    : real(el);
  wrap.getBoundingClientRect = () => ({ left: 0, top: 0, width: wrapW, height: wrapMaxH,
    right: wrapW, bottom: wrapMaxH, x: 0, y: 0 });
  // canvas 的畫面尺寸跟著 style.width 走（applyZoom 會設定）
  canvas.getBoundingClientRect = () => {
    const cw = parseFloat(canvas.style.width) || imgW;
    const ch = parseFloat(canvas.style.height) || imgH;
    return { left: 0, top: 0, width: cw, height: ch, right: cw, bottom: ch, x: 0, y: 0 };
  };
  let sl = 0, st = 0;
  Object.defineProperty(wrap, 'scrollLeft', { get: () => sl, set: v => { sl = Math.max(0, v); }, configurable: true });
  Object.defineProperty(wrap, 'scrollTop',  { get: () => st, set: v => { st = Math.max(0, v); }, configurable: true });
  return { canvas, wrap };
}

const PD = (id, x, y, type = 'touch') => ({ pointerId: id, clientX: x, clientY: y, pointerType: type, button: 0 });

// ============================================================
console.log('— 觸控裝置（390×844，模擬 iPhone）—');
{
  const { w, d } = bootAndRun({ coarse: true, vw: 390, vh: 844 });
  const { canvas, wrap } = stubLayout(w, d, { wrapW: 366, wrapMaxH: 506, imgW: 1600, imgH: 2200 });

  ok(d.body.classList.contains('touch'), 'body 應加上 .touch');
  ok(w.eval('editMode') === false, '觸控裝置預設為瀏覽模式');
  ok(d.getElementById('fbMode').textContent === '✋', '浮動按鈕應顯示 ✋');
  ok(d.getElementById('fbMode').getAttribute('aria-pressed') === 'false', '瀏覽模式按鈕應回報 aria-pressed=false');
  ok(/瀏覽模式/.test(d.getElementById('modeTip').textContent), 'modeTip 應說明瀏覽模式');
  ok(wrap.classList.contains('viewmode'), 'canvasWrap 應有 .viewmode');

  // 符合寬度：366 / 1600 ≈ 0.229
  w.eval("setZoomMode('fitW')");
  const z0 = w.eval('viewZoom');
  ok(Math.abs(z0 - 366 / 1600) < 0.01, `fitW 應約 ${(366/1600*100).toFixed(0)}%，實得 ${(z0*100).toFixed(0)}%`);

  // ---- 單指平移（瀏覽模式）----
  w.eval('pages=[{img:{width:1600,height:2200},dets:[]}];cur=0;');
  canvas.onpointerdown(PD(1, 200, 400));
  ok(w.eval("gest&&gest.type") === 'pan', '單指按下應進入 pan');
  canvas.onpointermove(PD(1, 200, 300));
  canvas.onpointermove(PD(1, 180, 200));
  ok(wrap.scrollTop === 0, `垂直拖曳不應捲動譜面內層，實得 ${wrap.scrollTop}`);
  ok(w.__pageScrollY === 200, `向上拖 200px 應改由整頁捲動 200，實得 ${w.__pageScrollY}`);
  ok(wrap.scrollLeft === 20, `向左拖 20px 應橫捲 20，實得 ${wrap.scrollLeft}`);
  canvas.onpointerup(PD(1, 180, 200));
  ok(w.eval('gest') === null, 'pan 結束後 gest 應清空');
  ok(w.eval('pages[0].dets.length') === 0, '平移不應新增標註');

  // ---- 雙指捏合放大 ----
  const zBefore = w.eval('viewZoom');
  canvas.onpointerdown(PD(1, 100, 400));
  canvas.onpointerdown(PD(2, 200, 400));      // 初始間距 100
  ok(w.eval("gest&&gest.type") === 'pinch', '兩指按下應進入 pinch');
  canvas.onpointermove(PD(1, 50, 400));
  canvas.onpointermove(PD(2, 250, 400));      // 間距 200 → 放大 2 倍
  const zAfter = w.eval('viewZoom');
  ok(Math.abs(zAfter / zBefore - 2) < 0.05, `捏合放大應約 2 倍，實得 ${(zAfter/zBefore).toFixed(2)}`);
  ok(w.eval("zoomMode") === 'free', '手動縮放後 zoomMode 應為 free');
  canvas.onpointerup(PD(1, 50, 400));
  canvas.onpointerup(PD(2, 250, 400));
  ok(w.eval('gest') === null, 'pinch 結束後 gest 應清空');
  ok(w.eval('pages[0].dets.length') === 0, '捏合不應新增標註');

  // ---- 雙擊：縮小狀態下雙擊 → 回 100% ----
  w.eval("setZoomMode('fitW')");
  canvas.onpointerdown(PD(1, 150, 300)); canvas.onpointerup(PD(1, 150, 300));
  canvas.onpointerdown(PD(1, 152, 302)); canvas.onpointerup(PD(1, 152, 302));
  ok(Math.abs(w.eval('viewZoom') - 1) < 1e-6, `雙擊應回到 100%，實得 ${(w.eval('viewZoom')*100).toFixed(0)}%`);
  // 再雙擊 → 回符合寬度
  canvas.onpointerdown(PD(1, 150, 300)); canvas.onpointerup(PD(1, 150, 300));
  canvas.onpointerdown(PD(1, 152, 302)); canvas.onpointerup(PD(1, 152, 302));
  ok(w.eval("zoomMode") === 'fitW', '再次雙擊應回到符合寬度');
  ok(w.eval('pages[0].dets.length') === 0, '雙擊不應新增標註');

  // ---- 切到編輯模式：單指點空白處 → 走新增和弦流程 ----
  let prompted = false;
  w.prompt = () => { prompted = true; return 'Bb'; };
  w.eval('setEditMode(true)');
  ok(w.eval('editMode') === true, 'setEditMode(true) 應生效');
  ok(d.getElementById('fbMode').textContent === '✏️', '編輯模式按鈕應顯示 ✏️');
  ok(d.getElementById('fbMode').getAttribute('aria-pressed') === 'true', '編輯模式按鈕應回報 aria-pressed=true');
  ok(!wrap.classList.contains('viewmode'), '編輯模式應移除 .viewmode');
  canvas.onpointerdown(PD(1, 100, 200));
  ok(w.eval("gest") === null, '編輯模式單指不應進入 pan');
  canvas.onpointerup(PD(1, 100, 200));
  ok(prompted, '編輯模式點空白處應叫出輸入框');
  ok(w.eval('pages[0].dets.length') === 1, `應新增 1 個手動標註，實得 ${w.eval('pages[0].dets.length')}`);
  ok(w.eval("pages[0].dets[0].text") === 'Bb', '新增的和弦應為 Bb');

  // ---- 編輯模式下第二指落下：取消標註拖曳、改成捏合，且框位置還原 ----
  const b0 = JSON.parse(w.eval('JSON.stringify(pages[0].dets[0].bbox)'));
  const cx = (b0.x0 + b0.x1) / 2, cy = (b0.y0 + b0.y1) / 2;
  const sc = w.eval('viewZoom');                       // 圖像座標 → 螢幕座標
  canvas.onpointerdown(PD(1, cx * sc, cy * sc));
  ok(w.eval('dragSt&&dragSt.hit&&dragSt.hit.mode') === 'move', '按在綠框上應判定為 move');
  canvas.onpointermove(PD(1, cx * sc + 60, cy * sc + 60));
  ok(w.eval('dragSt.moved') === true, '拖曳超過門檻應標記 moved');
  canvas.onpointerdown(PD(2, cx * sc + 200, cy * sc));
  ok(w.eval("gest&&gest.type") === 'pinch', '第二指落下應切成 pinch');
  ok(w.eval('dragSt') === null, '應放棄標註拖曳');
  const b1 = JSON.parse(w.eval('JSON.stringify(pages[0].dets[0].bbox)'));
  ok(Math.abs(b1.x0 - b0.x0) < 1e-6 && Math.abs(b1.y0 - b0.y0) < 1e-6, '被拖動的框應還原到原位');
  canvas.onpointercancel(PD(1, 0, 0)); canvas.onpointercancel(PD(2, 0, 0));
  ok(w.eval('gest') === null && w.eval('ptrs.size') === 0, 'pointercancel 應清乾淨狀態');

  // ---- 觸控命中容差應大於滑鼠 ----
  w.eval('setZoom(1)');
  const far = w.eval(`(()=>{const p=curPage(),b=p.dets[0].bbox;
    const x=b.x1+12/viewZoom, y=(b.y0+b.y1)/2;
    return [!!hitTest(p,x,y,false), !!hitTest(p,x,y,true)];})()`);
  ok(far[1] === true, '框外 12px 觸控應命中');
  ok(far[0] === false, '框外 12px 滑鼠不應命中（容差 5px）');
}

// ============================================================
console.log('— 桌機（滑鼠，1440×900）行為不變 —');
{
  const { w, d } = bootAndRun({ coarse: false, vw: 1440, vh: 900 });
  const { canvas, wrap } = stubLayout(w, d, { wrapW: 1000, wrapMaxH: 675, imgW: 1600, imgH: 2200 });
  ok(!d.body.classList.contains('touch'), '桌機不應加 .touch');
  ok(w.eval('editMode') === true, '桌機預設即為編輯模式');
  ok(!wrap.classList.contains('viewmode'), '桌機不應有 .viewmode');
  ok(d.getElementById('floatBar').classList.contains('on') === false, '浮動工具列預設隱藏');

  w.eval('pages=[{img:{width:1600,height:2200},dets:[]}];cur=0;');
  w.eval("setZoomMode('fitW')");
  ok(Math.abs(w.eval('viewZoom') - 1000 / 1600) < 0.01, 'fitW 應為 62.5%');
  w.eval("setZoomMode('fitP')");
  ok(Math.abs(w.eval('viewZoom') - 675 / 2200) < 0.01, 'fitP 應為 30.7%（受高度限制）');

  // 滑鼠點空白處仍直接新增和弦（不受 editMode 以外的邏輯影響）
  let prompted = false;
  w.prompt = () => { prompted = true; return 'G7'; };
  w.eval("setZoom(1)");
  canvas.onpointerdown(PD(1, 300, 500, 'mouse'));
  ok(w.eval('gest') === null, '滑鼠不應進入 pan');
  canvas.onpointerup(PD(1, 300, 500, 'mouse'));
  ok(prompted && w.eval('pages[0].dets.length') === 1, '滑鼠點空白處應新增和弦');

  // 滑鼠拖曳門檻仍為 3px
  const b = JSON.parse(w.eval('JSON.stringify(pages[0].dets[0].bbox)'));
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  canvas.onpointerdown(PD(1, cx, cy, 'mouse'));
  canvas.onpointermove(PD(1, cx + 2, cy + 2, 'mouse'));
  ok(w.eval('dragSt.moved') === false, '滑鼠位移 2px 仍算點擊');
  canvas.onpointermove(PD(1, cx + 6, cy + 6, 'mouse'));
  ok(w.eval('dragSt.moved') === true, '滑鼠位移 6px 算拖曳');
  canvas.onpointerup(PD(1, cx + 6, cy + 6, 'mouse'));
  ok(w.eval('pages[0].dets.length') === 1, '拖曳結束不應誤刪綠框');
}

// ============================================================
console.log('— 頁籤語意與鍵盤操作 —');
{
  const { w, d } = bootAndRun({ coarse: false, vw: 1024, vh: 768 });
  const imgTab = d.getElementById('tab-img'), txtTab = d.getElementById('tab-txt');
  ok(imgTab.tagName === 'BUTTON' && txtTab.tagName === 'BUTTON', '模式頁籤應使用原生 button');
  ok(imgTab.getAttribute('role') === 'tab' && imgTab.getAttribute('aria-selected') === 'true', '圖片頁籤應有正確初始語意');
  txtTab.click();
  ok(txtTab.getAttribute('aria-selected') === 'true' && txtTab.tabIndex === 0, '點文字頁籤後應更新選取與 tabIndex');
  ok(d.getElementById('panel-txt').getAttribute('aria-hidden') === 'false' && d.getElementById('panel-img').getAttribute('aria-hidden') === 'true',
     '切換頁籤應同步 tabpanel 的 aria-hidden');
  txtTab.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  ok(imgTab.getAttribute('aria-selected') === 'true' && d.activeElement === imgTab, '方向鍵應切換並聚焦相鄰頁籤');
  const drop = d.getElementById('drop');
  ok(drop.getAttribute('role') === 'button' && drop.tabIndex === 0, '上傳區應可用鍵盤聚焦');
  const canDockUpload = w.eval("typeof dockUploadToPreview === 'function'");
  ok(canDockUpload, '載入譜面後應有把更換入口整合進預覽區的行為');
  if (canDockUpload) {
    w.eval('dockUploadToPreview()');
    ok(drop.parentElement === d.getElementById('canvasArea'), '更換譜面入口應移入實際譜面預覽區');
    ok(drop.classList.contains('compact') && drop.getAttribute('aria-label') === '更換圖片或 PDF 譜面',
       '整合後的入口應呈現精簡的更換譜面按鈕語意');
  }
}

// ============================================================
console.log('— CSS 檢查 —');
{
  ok(/@media\(max-width:768px\)/.test(html), '應有 768px 斷點');
  const mq = html.slice(html.indexOf('@media(max-width:768px)'));
  ok(/select,textarea,input\[type=text\],input\[type=number\]\{font-size:16px\}/.test(mq),
     '手機表單控制項應 ≥16px（避免 iOS 聚焦自動放大）');
  ok(/\.btn,button\{min-height:44px\}/.test(mq), '手機按鈕最小高度 44px');
  ok(/\.controls\{display:grid/.test(mq), '手機控制列應改為網格');
  const fb = /#floatBar \.fb\{width:(\d+)px;height:(\d+)px/.exec(html);
  ok(fb && Number(fb[1]) >= 44 && Number(fb[2]) >= 44, '浮動按鈕至少應為 44×44');
  ok(/@media\(any-pointer:coarse\)/.test(html), '應針對粗略指標裝置放大觸控目標');
  ok(/#floatBar \.fb\{width:48px;height:48px;min-height:48px\}/.test(html), '觸控裝置浮動按鈕應為 48×48');
  ok(/env\(safe-area-inset-bottom\)/.test(html), '應避開手機底部安全區');
  ok(/button,\.tab,\.drop\{touch-action:manipulation\}/.test(html), '一般互動元件應使用 manipulation 觸控策略');
  ok(/prefers-reduced-motion:reduce/.test(html), '應尊重減少動態效果偏好');
  ok(!/style="display:none"/.test(html.split('<script>')[0]), '版面切換應改用 class 而非 inline display');
  const canvasRule = /#canvasWrap\{([^}]*)\}/.exec(html);
  ok(canvasRule && /overflow-x:auto/.test(canvasRule[1]) && /overflow-y:hidden/.test(canvasRule[1]),
     '譜面預覽只保留必要的水平捲動，不應有內層垂直捲軸');
  ok(canvasRule && !/max-height/.test(canvasRule[1]), '譜面預覽高度應隨完整譜面展開');
  ok(!/#canvasWrap\{[^}]*max-height/.test(mq), '手機版也不應重新限制譜面預覽高度');
  const compactRule = /\.drop\.compact\{([^}]*)\}/.exec(html);
  ok(compactRule && /position:absolute/.test(compactRule[1]), '更換譜面入口應浮在預覽區內，不另占一整列');
  ok(/\.drop\.compact \.drop-copy[^}]*display:none/.test(html), '精簡更換入口不應保留冗長上傳說明');
}

console.log(`\n${fails ? '❌' : '✅'} 通過 ${passes} 項，失敗 ${fails} 項`);
process.exit(fails ? 1 : 0);
