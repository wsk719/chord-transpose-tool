// OCR 回歸測試：不載入 DOM，只抽取和弦辨識的純函式驗證關鍵決策。
const fs = require('fs');
const path = require('path');

const sourcePath = process.argv[2] || path.join(__dirname, '..', '和弦轉調工具.html');
const src = fs.readFileSync(sourcePath, 'utf8');

function functionSource(name) {
  const start = src.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`找不到 function ${name}`);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`function ${name} 大括號不完整`);
}

const constants = /const PDF_RENDER_TARGET=\d+,PDF_RENDER_MAX_SCALE=\d+;/.exec(src)?.[0];
if (!constants) throw new Error('找不到 PDF 渲染常數');
const noteIndex = /const NOTE_INDEX=\{[^;]+;/.exec(src)?.[0];
const sharpLookalike = /const SHARP_LOOKALIKE=.*?;/.exec(src)?.[0];
if (!noteIndex || !sharpLookalike) throw new Error('找不到和弦解析常數');
const api = new Function(`${constants}
  ${noteIndex}
  ${functionSource('norm')}
  ${functionSource('parseChord')}
  ${functionSource('plausibleBass')}
  ${functionSource('correctCore')}
  ${functionSource('correctToken')}
  ${functionSource('leadingQuoteChord')}
  ${sharpLookalike}
  ${functionSource('sharpenToken')}
  ${functionSource('repeatBarCorrect')}
  ${functionSource('isRepeatBarChordLine')}
  ${functionSource('repeatEndingChordTail')}
  ${functionSource('sparseCorrect')}
  ${functionSource('pdfRenderScale')}
  ${functionSource('isImplausiblyWideSingleChord')}
  ${functionSource('findSparseChordBands')}
  ${functionSource('sortDetsReadingOrder')}
  return {correctToken,leadingQuoteChord,repeatBarCorrect,isRepeatBarChordLine,repeatEndingChordTail,sparseCorrect,pdfRenderScale,isImplausiblyWideSingleChord,findSparseChordBands,sortDetsReadingOrder};`)();

let passes = 0, fails = 0;
function ok(cond, message) {
  if (cond) passes++;
  else { fails++; console.log(`  ✗ ${message}`); }
}

const pdfScale = api.pdfRenderScale(566.46);
ok(pdfScale > 4.5 && pdfScale < 4.7,
  `裁切 PDF 應直接渲染到約 2600px（scale≈4.59），實得 ${pdfScale.toFixed(2)}`);
ok(api.pdfRenderScale(2000) === 1.5, '大型 PDF 頁面應維持最小 1.5 倍渲染');

ok(api.correctToken('A)') === null, '沒有左括號的 A) 不應被剝成標題區假和弦 A');
ok(api.correctToken('(A)')?.str === 'A', '成對括號內的真正和弦 (A) 仍應保留');
ok(api.leadingQuoteChord("'F")?.str === 'F' && api.leadingQuoteChord("'F")?.lead === 1 && api.leadingQuoteChord("'F")?.noisyLead,
  '前導撇號黏住的 F 應進入既有低信心同行救援');
ok(api.correctToken("'F") === null, '前導撇號和弦不應繞過同行門檻直接進入一般解析');

ok(api.sparseCorrect('pm?')?.str === 'Dm7', '可信窄帶內 pm? 應還原為 Dm7');
ok(api.sparseCorrect('Gc')?.str === 'G', '可信窄帶內 Gc 應還原為 G');
ok(api.sparseCorrect('||2-Dm7')?.str === 'Dm7', '可信窄帶內黏住第二結尾線的 ||2-Dm7 應還原為 Dm7');
ok(api.repeatEndingChordTail('||2-Dm7')?.tail === 'Dm7', '應辨識反覆結尾編號黏和弦標誌');
ok(api.repeatEndingChordTail('G/B') === null, '一般和弦列不應啟動反覆結尾積極解析');

const repeatRowA = ['IC','TAm','IE','Gl','a'];
const repeatRowB = ['IC','fAm','1K','1G','a'];
ok(api.isRepeatBarChordLine(repeatRowA), '灰階輪的小節線黏字應被辨識為反覆和弦列');
ok(api.isRepeatBarChordLine(repeatRowB), '原色輪的小節線黏字應被辨識為反覆和弦列');
ok(repeatRowA.map(t=>api.repeatBarCorrect(t)?.str).filter(Boolean).join(' ') === 'C Am F',
  '灰階輪應還原 C Am F，並留給另一輪補回 G');
ok(repeatRowB.map(t=>api.repeatBarCorrect(t)?.str).filter(Boolean).join(' ') === 'C Am F G',
  '原色輪應完整還原 C Am F G，且不能把結尾 a 當 A');
ok(!api.isRepeatBarChordLine(['The','Lord','is','good']), '一般英文歌詞行不得啟用反覆列積極修正');
ok(api.repeatBarCorrect('Team') === null, '一般 T 開頭單字不得剝成和弦');

ok(api.isImplausiblyWideSingleChord('A', {x0: 0, y0: 0, x1: 104, y1: 25}),
  '寬度達字高四倍的假 A 應拒絕');
ok(!api.isImplausiblyWideSingleChord('G', {x0: 0, y0: 0, x1: 31, y1: 35}),
  '正常比例的單字母 G 應保留');
ok(!api.isImplausiblyWideSingleChord('Am7', {x0: 0, y0: 0, x1: 100, y1: 30}),
  '寬度規則不應套到多字符和弦');

const word = (text, cy, x) => ({text, confidence: 80,
  bbox: {x0: x, y0: cy - 18, x1: x + 60, y1: cy + 18}});
const chordSet = new Set(['G/B','Am7','C/G','Fmaj7','G/F','E7','E7/G#','Dm7','G7']);
const parse = text => chordSet.has(text) ? {str: text} : null;
const sparseData = {lines: [{words: [
  word('G/B', 107, 100), word('Am7', 108, 300), word('C/G', 106, 500), word('Fmaj7', 107, 700),
  word('G/F', 808, 100), word('E7', 807, 300), word('E7/G#', 806, 500), word('Am7', 809, 700),
  word('Dm7', 1509, 100), word('Dm7', 1510, 500), word('G7', 1508, 800),
  // 只有兩個疑似和弦的雜訊列，不足以觸發積極的 PSM 7 補掃。
  word('E7', 1051, 200), word('Am7', 1052, 600),
] }]};
const bands = api.findSparseChordBands(sparseData, parse);
ok(bands.length === 3, `應建立 3 個可信和弦窄帶並排除 2 候選雜訊列，實得 ${bands.length}`);
ok(bands.every(b => b.n >= 3), '每個補掃窄帶都應至少有 3 個多字符和弦錨點');

const expected = ['G','C','G/B','Am7','C/G','Fmaj7','G','G/F','E7','E7/G#','Am7','C/G','F','C/E','Dm7','G','Dm7','G7','C'];
const points = expected.map((text, i) => {
  const row = i < 6 ? 0 : i < 14 ? 1 : 2;
  const col = row === 0 ? i : row === 1 ? i - 6 : i - 14;
  return {text, bbox:{x0:100+col*120,y0:100+row*700+(col%2?2:0),x1:150+col*120,y1:136+row*700+(col%2?2:0)}};
});
const shuffled = [...points].sort((a,b)=>(b.bbox.x0%7)-(a.bbox.x0%7));
const ordered = api.sortDetsReadingOrder(shuffled).map(d=>d.text);
ok(JSON.stringify(ordered) === JSON.stringify(expected),
  `和弦應按水平帶與 x 座標排序，實得 ${ordered.join(' ')}`);

ok(!src.includes('[ocr-debug:')&&!src.includes('__ocrDebug')&&!src.includes('ocrDebugData'),
  '正式原始碼不應殘留 OCR 診斷輸出');

console.log(`\n${fails ? '❌' : '✅'} OCR 測試通過 ${passes} 項，失敗 ${fails} 項`);
process.exit(fails ? 1 : 0);
