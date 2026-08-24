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
  ${functionSource('sparseBandCrop')}
  ${functionSource('findStaffSystems')}
  ${functionSource('findHybridNumberedStaffSystems')}
  ${functionSource('staffChordBandCrop')}
  ${functionSource('isDetInStaffChordBand')}
  ${functionSource('staffBandCorrect')}
  ${functionSource('sortDetsReadingOrder')}
  return {correctToken,leadingQuoteChord,repeatBarCorrect,isRepeatBarChordLine,repeatEndingChordTail,sparseCorrect,pdfRenderScale,isImplausiblyWideSingleChord,findSparseChordBands,sparseBandCrop,findStaffSystems,findHybridNumberedStaffSystems,staffChordBandCrop,isDetInStaffChordBand,staffBandCorrect,sortDetsReadingOrder};`)();

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
ok(api.sparseCorrect('[12.Dm7')?.str === 'Dm7', '窄帶縮短後的 [12.Dm7 應還原為第二結尾 Dm7');
ok(api.repeatEndingChordTail('||2-Dm7')?.tail === 'Dm7', '應辨識反覆結尾編號黏和弦標誌');
ok(api.repeatEndingChordTail('[12.Dm7')?.tail === 'Dm7', '應接受左方框線被讀成 [1 的反覆結尾形態');
ok(api.repeatEndingChordTail('G/B') === null, '一般和弦列不應啟動反覆結尾積極解析');

const repeatRowA = ['IC','TAm','IE','Gl','a'];
const repeatRowB = ['IC','fAm','1K','1G','a'];
const repeatRowC = ['I:','F','C/E','|Am','Ke','a'];
ok(api.isRepeatBarChordLine(repeatRowA), '灰階輪的小節線黏字應被辨識為反覆和弦列');
ok(api.isRepeatBarChordLine(repeatRowB), '原色輪的小節線黏字應被辨識為反覆和弦列');
ok(api.isRepeatBarChordLine(repeatRowC), '第二列即使 |G 被讀成 Ke，末尾 a 仍應作為 :|| 的結構證據');
ok(repeatRowA.map(t=>api.repeatBarCorrect(t)?.str).filter(Boolean).join(' ') === 'C Am F',
  '灰階輪應還原 C Am F，並留給另一輪補回 G');
ok(repeatRowB.map(t=>api.repeatBarCorrect(t)?.str).filter(Boolean).join(' ') === 'C Am F G',
  '原色輪應完整還原 C Am F G，且不能把結尾 a 當 A');
ok(repeatRowC.map(t=>api.repeatBarCorrect(t)?.str).filter(Boolean).join(' ') === 'F C/E Am',
  '第二列本輪只保留可信和弦，Ke 交由另一輪補 G，末尾 a 不得成為 A');
ok(api.correctToken('a')?.str === 'A', '測試前提：一般解析仍允許小寫 a 表示 A 和弦');
ok(/if\s*\(repeatLine\)\s*lineAcc\s*=\s*repeatDets\s*;/.test(src),
  '確認為反覆列後，最終候選必須只採反覆列修正，不能混回一般解析產生的假 A');
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

const verticalLineCrop = api.sparseBandCrop({cy:652,h:36}, 3000);
ok(verticalLineCrop.top === 616 && verticalLineCrop.bottom === 670,
  `和弦窄帶下緣應停在基線附近、避開 C 下方小節線，實得 ${JSON.stringify(verticalLineCrop)}`);
ok(api.sparseBandCrop({cy:12,h:20}, 25).top === 0 && api.sparseBandCrop({cy:20,h:20}, 25).bottom === 25,
  '和弦窄帶裁切仍應限制在影像上下邊界內');

const ocrWord = (text, cy, x, h=30) => ({text, confidence:80,
  bbox:{x0:x,y0:cy-h/2,x1:x+Math.max(18,text.length*16),y1:cy+h/2}});

const dens=new Array(1500).fill(0),run=new Array(1500).fill(0);
for(const top of [632,995,1358])for(const off of [0,12,23,35,47])for(const y of [top+off,top+off+1]){
  dens[y]=0.83;run[y]=0.83;
}
const staffSystems=api.findStaffSystems(dens,run);
ok(staffSystems.length===3, `應從 15 條譜線建立 3 個五線譜系統，實得 ${staffSystems.length}`);
ok(Math.abs(staffSystems[0].top-632.5)<0.1&&Math.abs(staffSystems[0].space-12)<0.6,
  `第一系統譜線位置／間距錯誤：${JSON.stringify(staffSystems[0])}`);

const denseLine=(cy,n=10)=>({words:Array.from({length:n},(_,i)=>ocrWord(i%3?'oo':'|',cy,i*90,28))});
const scale=2600/1654;
const hybridData={lines:[
  denseLine(910),denseLine(940),
  denseLine(1470),denseLine(1510),
  denseLine(2025),denseLine(2060),
]};
const hybridSystems=api.findHybridNumberedStaffSystems(staffSystems,scale,hybridData);
ok(hybridSystems.length===3, `每個譜系上方都有成對密集簡譜列，應辨識 3 個混合譜系，實得 ${hybridSystems.length}`);
const normalChordData={lines:[denseLine(1390,4)]};
ok(api.findHybridNumberedStaffSystems(staffSystems,scale,normalChordData).length===0,
  '只有單一正常和弦列時不得啟用簡譜專用幾何規則');
const staffCrop=api.staffChordBandCrop(staffSystems[1],3000,scale);
ok(staffCrop.top>=1342&&staffCrop.top<=1344&&staffCrop.bottom>=1435&&staffCrop.bottom<=1437,
  `第二系統和弦帶應包住 y=1390 並停在數字列前，實得 ${JSON.stringify(staffCrop)}`);
ok(api.isDetInStaffChordBand({bbox:{x0:100,y0:875,x1:130,y1:900}},staffSystems),
  '第二系統 y≈887 的真和弦框應位於幾何和弦帶');
ok(!api.isDetInStaffChordBand({bbox:{x0:100,y0:935,x1:130,y1:960}},staffSystems),
  '第二系統 y≈947 的簡譜假框不得位於幾何和弦帶');
ok(api.staffBandCorrect('C—')?.str==='C', '混合譜系專用窄帶內，C 黏住延音線時應還原 C');
ok(api.staffBandCorrect('C67')?.str==='C', '混合譜系專用窄帶內，C 黏住簡譜 6/7 時應還原 C');
ok(api.staffBandCorrect('Cc')?.str==='C'&&api.staffBandCorrect('Co')?.str==='C'
  &&api.staffBandCorrect('C_')?.str==='C'&&api.staffBandCorrect('c')?.str==='C',
  '混合譜系專用窄帶應還原實圖的 Cc／Co／C_／c');
ok(api.staffBandCorrect('¢')?.str==='G', '混合譜系專用窄帶內，特殊字形 G 被讀成 ¢ 時應還原 G');
ok(api.staffBandCorrect('G')?.str==='G'&&api.staffBandCorrect('G7')?.str==='G7',
  '混合譜系專用修正不得改動已正確的 G／G7');
ok(api.correctToken('C67')?.str==='C67', '一般和弦解析仍須保持原行為，不套用混合譜系去尾規則');

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
ok(!src.includes('number-trace')&&!src.includes('number-band')&&!src.includes('number-glyph'),
  '正式原始碼不應殘留本附件的臨時分行／字形診斷');

console.log(`\n${fails ? '❌' : '✅'} OCR 測試通過 ${passes} 項，失敗 ${fails} 項`);
process.exit(fails ? 1 : 0);
