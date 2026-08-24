# 專案知識庫

## 2026-08-24 — 五線譜上方簡譜數字被當成和絃
- 《平安夜》同時排有五線譜與簡譜；Tesseract PSM 3 會把簡譜拆成上下相鄰的兩個高密度 OCR 列，舊的一般解析因此把數字與歌詞碎片當成和絃。不能靠單一 OCR 行的文字內容判斷簡譜，因為實際分行與視覺上的一行不同。
- 修正先以既有長水平線條件找出真正的五線譜五線組，再要求譜線上方窄區出現兩個相鄰高密度 OCR 列才確認為「五線譜＋簡譜」系統；一般只有一列 `G7 / Cmaj7` 的和絃譜不會觸發。
- 確認後只以 PSM 6 掃描距譜線頂端約 12 至 7 個譜線間距的和絃帶，並把附件實際誤讀 `¢→G`、`Cc/Co/C_/c→C` 限制在此可信區域。只有整頁所有五線組都符合混合簡譜特徵時，才以窄帶結果取代一般頁面候選，因此不改動通用 `correctToken()` 與其他和絃判斷。
- 真實圖片驗證三行依序為 `C G C`、`F C F C`、`G G7 C C G7 C`，數字與歌詞無假框；既有《無價至寶》19 和絃 PDF 回歸仍完整。原始碼與部署版 OCR 各 46 項通過；手機互動測試因環境沒有 `jsdom` 未執行，但本次沒有變更互動程式。

## 2026-08-24 — 和弦下方垂直小節線使完整 PDF 的單字母 C 漏抓
- 《無價至寶》完整 PDF 第 2 頁第一列的第二個 `C`，舊版在 PSM 3 兩輪都整列漏掉單字母，PSM 11 只留下多字元錨點；PSM 7 窄帶補掃又因下緣取到 `cy + 0.9h`，吃進 `C` 下方的垂直小節線，把 x=670–1016 的大片譜面合成信心 0 的 `Sc`。
- `sparseBandCrop()` 將可信和弦窄帶下緣收至 `cy + 0.5h`（上緣仍為 `cy - h`），只保留和弦基線附近；同一完整原檔的 PSM 7 因而輸出獨立 `C`（信心 86.5），第一列恢復 `G / C / G/B / Am7 / C/G / Fmaj7`。
- 收窄後頁尾反覆標記會由 `||2-Dm7` 變成 `[12.Dm7`；若 `repeatEndingChordTail()` 不接受 `[`，整帶不會啟動積極解析，同行 `pm?` 就無法還原為第一結尾 `Dm7`。反覆前綴現接受 1–3 個 `| / I / l / ! / [`，但仍要求後接「數字 + 分隔符 + 可解析和弦」，完整原檔恢復兩個 `Dm7`。
- 不能以裁切後單頁 PDF 代替完整原檔驗收：裁切會改變渲染頁框與 OCR 分段，本案例在裁切版原本就能通過、完整原檔卻會失敗。端到端回歸必須直接上傳使用者提供的完整 PDF，再切到目標頁視覺核對。
- 純函式測試固定 `sparseBandCrop({cy:652,h:36})` 的 top=616、bottom=670、影像邊界夾取與兩種反覆結尾前綴；正式原始碼與部署版各 28 項 OCR、各 73 項互動測試通過，正式無快取頁面沒有診斷日誌。

## 2026-08-24 — 標題碎片 `A)` 誤判與前導撇號和弦漏救援
- 《在神沒有難成的事》頁首兩輪 OCR 把標題「神」的局部讀成 `AY`／`A)`；舊 `correctToken()` 無條件剝除結尾右括號，使 `A)` 成為信心 61.7 的假 `A`。目前只接受成對括號中的和弦（如 `(A)`），可解析和弦後方若只有不成對的 `)` 則拒絕。
- `Or:` 列第三個 `F` 兩輪皆為前導撇號黏字 `'F`（信心 9.6／0）。它只會進入「同行已確認至少 3 個和弦」的低信心救援，不會走一般解析；撇號像垂直小節線，會把字框拉到一般字高的 1.68 倍，因此只為此種 `noisyLead` 候選採 1.75 倍字高上限，其他救援維持 1.6 倍。
- 真實 PDF.js + Tesseract.js 驗證後，標題假 `A` 消失，頁首 `Or:` 列依序為 `C / C / F / G`。純函式測試固定 `A)` 拒絕、`(A)` 保留、`'F` 不得繞過同行門檻及正式碼無診斷殘留。

## 2026-08-24 — 文字譜反覆列的小節線黏字造成整列被防誤判淘汰
- 《在神沒有難成的事》右下 `||: C | Am | F | G :||` 並未被裁切；兩輪 Tesseract 實際輸出為 `IC / TAm / IE / Gl / a` 與 `IC / fAm / 1K / 1G / a`。一般解析只剩少量候選，`detectFrom()` 因可疑英文數量過多而把整列拒絕。
- `repeatBarCorrect()` 只在同行至少有 3 個小節線黏字標記且可還原至少 3 個和弦時啟用，處理 `TAm/fAm→Am` 與附件特有的 `IE/1K→F`；正常大寫和弦仍可併入，但小寫結尾雜訊 `a` 不會成為假 `A`。
- 真實 PDF.js + Tesseract.js 端到端驗證已在第一列標出 `C / Am / F / G`；純函式測試同時固定兩輪原始誤讀與一般英文歌詞不得觸發積極修正。
- 同附件第二列兩輪分別輸出 `I: / F / C/E / |Am / |G / a` 與 `I: / F / C/E / |Am / Ke / a`；原色輪少一個明確小節線而退回一般解析，低信心 `a` 又被同行救援成假 `A`，兩輪聯集後覆蓋在列尾 `:||` 上。反覆列一旦成立，最終候選現在只採 `repeatBarCorrect()`，不混回一般解析；末尾小寫 `a` 可在已有 2 個小節線與 3 個可信和弦時補作第三個結構證據，但本身永不成為和弦。
- 完整 PDF 在原調時列尾不再有藍框，升高 1 半音後仍保留原 `:||`、不再畫出假 `A#`；原始碼與部署版各 32 項 OCR、各 73 項互動測試通過。

## 2026-08-24 — 上傳入口與譜面預覽整合、取消巢狀垂直捲動
- 圖片／PDF 辨識完成後，`dockUploadToPreview()` 會把原本的 `#drop` 移入 `#canvasArea`，改成預覽右上角的小型「更換譜面」按鈕；沿用同一個 file input 與 drop/paste/keyboard handler，未載入前仍是完整上傳區。
- `#canvasWrap` 不再設 `max-height`，採 `overflow-x:auto;overflow-y:hidden`：手動放大仍可水平捲動，長譜面則讓容器完整展開，只由網頁本身提供垂直捲軸。
- 觸控 `panBy()` 的水平位移仍更新 `canvasWrap.scrollLeft`，垂直位移一律交給 `window.scrollBy()`；縮放錨點的垂直補償也同步交給頁面。測試需同時斷言預覽無垂直 overflow、整頁可捲動，以及桌機／手機更換入口都位於 `#canvasArea` 內。

## 2026-08-24 — 反覆結尾延長線下的和弦窄帶漏抓
- 《無價至寶》完整 PDF 第二頁最末列雖已由 PSM 11 的 3 個多字元錨點建立補掃窄帶，PSM 7 實際輸出卻是 `pm? / Gc / ||2-Dm7 / G7 / Cc`；舊 `scanChordBands()` 又把補掃結果送回一般 `detectFrom()`，沒有使用已存在的 `sparseCorrect()`，所以第一結尾 `Dm7 / G` 與末尾 `C` 被歌詞防誤判門檻擋掉。
- 修正只在補掃字詞含反覆結尾標誌（如 `||2-Dm7`）時啟用積極窄帶解析；其他一般和弦列仍走原本保守流程。窄帶新增 `pm?→Dm7`、結尾編號前綴剝除，並沿用既有 `Gc→G`，單字母低信心候選仍須至少 20 分。
- 單變因實驗證明不需要擦除延長線像素：保留原影像也能抓回 `Dm7 / G / Dm7 / G7 / C`。完整第二頁目前 19/19 個和弦；頁尾音符仍有附件中原本的 1 個誤框，沒有因本次積極解析增加前兩列誤框。
- 回歸測試直接抽正式原始碼的 `repeatEndingChordTail()`／`sparseCorrect()`，固定 `pm?`、`Gc`、`||2-Dm7` 與一般 `G/B` 不觸發反覆結尾模式；必須再用完整 PDF.js + Tesseract.js 路徑視覺核對，合成窄帶測試無法單獨證明端到端結果。

## 2026-08-23 — PDF 稀疏和弦列整列漏抓
- 重現檔的第二頁有三行和弦，但 PDF.js 原本先渲染到約 1600px，再由 `ocrOne()` 放大到 OCR 尺寸；小字的字緣在第一次縮圖時已損失，PSM 3 只留下中間行的 `E7 / Am7 / C/G / C/E`。PDF 首次渲染改為目標寬 2600px、上限 5 倍，避免低解析中介圖。
- PSM 11 雖能看見被整列漏掉的多字符和弦，舊 `sparseRescue()` 卻只接受「已有偵測」的水平帶，所以無法用它建立新列。現在同高且至少 3 個多字符候選會形成可信窄帶，針對該帶用 PSM 7 單行補掃，救回同行單字母 `G/C/F`，再交回既有稀疏救援合併。
- 單行裁切的下緣不可碰第一條譜線，否則單字母會黏成 `-C`／`CB`；範圍採候選中心上方 1.0 倍、下方 0.9 倍字高。另拒絕寬度超過字高 2.2 倍的單字母框，排除圖形被誤讀成 `A`。
- 第二頁真實 PDF 路徑由 4 個正確候選修到 19 個且零額外候選；`tests/test_ocr.js` 固定 PDF 渲染尺度、三錨點窄帶、寬單字母拒絕與閱讀順序，原始碼及部署版各 9 項斷言。

## 2026-08-23 — 視覺系統、語意頁籤與觸控控制密度
- 頁面已改成置中的 `.app-shell`、卡片式 `.panel` 與群組化 `.controls`；圖片載入成功後，上傳區會加 `.compact` 變成「更換譜面」列。調整 UI 時仍須保留既有控制項 id，OCR／轉調與 jsdom 手勢測試都依賴它們。
- 圖片／文字模式現在是原生 `<button role="tab">` 搭配 `<section role="tabpanel">`，`activateTab()` 同步 `aria-selected`、`tabIndex`、`aria-hidden`，並支援方向鍵、Home、End。上傳區可用 Enter／Space；觸控瀏覽／編輯按鈕同步 `aria-pressed`。
- 觸控尺寸不只靠寬度斷點：`@media(any-pointer:coarse)` 將主要控制與浮動工具提高到 48px、放大 range／checkbox，隱藏和浮動工具重複的桌面縮放列；浮動列與頁面底部使用 `env(safe-area-inset-*)` 避開手機安全區。320px 以下的半音與升降記號控制改跨欄，避免 stepper 擠壓。
- 部署版隱私提醒的 CSS 已併回唯一原始碼；`build_site.py` 只在 `</header>` 後注入精簡提醒，避免綁死 header 文案。驗證基準為原始碼與 `docs/index.html` 各 64 項 jsdom 斷言、`node --check`、建置，以及 320／390／834／1440 寬度瀏覽器實測。

## 2026-08-01 — 手機版：響應式版面 ＋ 觸控手勢（瀏覽/編輯模式）
- **最大的坑：`#imgCanvas{touch-action:none}` 讓手機完全不能操作**。這行是 2026-07-31 為了讓「拖曳綠框」不被瀏覽器捲動吃掉才加的，代價是**手指在譜面上做任何事都不會捲動也不會縮放** —— 桌機看不出問題（有滾輪、有 Ctrl＋滾輪），手機上譜面等於被釘死。而且縮放入口只綁 `Ctrl/⌘＋滾輪`，觸控裝置根本沒有對應手勢。
- 解法不是拿掉 `touch-action:none`（那樣就換成拖曳標註失效），而是**兩者都自己實作**：
  - `IS_TOUCH = matchMedia('(any-pointer:coarse)').matches` → 觸控裝置預設 `editMode=false`（瀏覽），純滑鼠裝置 `editMode=true`，**桌機行為與過去完全相同**。
  - 模式判斷用 `e.pointerType!=='mouse'`，所以觸控筆電上插滑鼠仍然直接編輯，不必切模式。
  - 譜面右下角浮動工具列 `#floatBar`（✋/✏️＋−/＋/⇔），只在 `IS_TOUCH` 且載入完成後顯示。放在新的 `#canvasArea{position:relative}` 裡而**不是** `#canvasWrap` 裡 —— 後者是 `overflow:auto`，絕對定位的子元素會跟著內容捲走。
- 手勢實作（全部走 pointer events，`ptrs` Map 記錄每根手指的 client 座標）：
  - 1 指 ＋ 瀏覽模式 → `pan`：**增量式**（每次 move 只算與上次的差），因為要把捲不動的餘量轉給 `window.scrollBy` —— 譜面捲到底時手指若「卡住」體感很差。絕對式（記起點）做不到這件事。
  - 2 指（**任何模式**）→ `pinch`：`setZoom(viewZoom*(d/d0), 兩指中點)` 後把 `d0` 更新為 `d`（增量），再用中點位移 `panBy` 一起平移。第二指落下時呼叫 `abortDrag()`，把已被拖動的框 `Object.assign` 還原 —— 否則「想縮放卻先碰到一個綠框」會把框移走。
  - 雙擊（瀏覽模式、位移 <10px、間隔 <320ms、距離 <40px）→ `viewZoom<1` 就回 100%，否則回符合寬度。
- **`hitTest` 的容差不能只放大、必須設上限**（jsdom 測試抓到的真實 bug）：觸控容差原本寫 `24/viewZoom`，在「符合寬度」約 23% 時等於 **105 個原圖像素**，比整個和弦框（約 53×36）還大 → 右下角手把的判定範圍蓋住整個框身，**每一下都被判成 resize，框變成刪不掉也拖不動**。修法是把上限拉進迴圈內、依框自身尺寸夾住：`m=min(框寬,框高)`、`hr=min(hrMax, m*0.6)`、`tol=min(tolMax, m)`。桌機 viewZoom=1 時算出來與舊值完全相同（hr=16、tol=5），無回歸。
- 版面：`@media(max-width:768px)` 把 `.controls` 由 flex-wrap 改 **2 欄 grid**（顏色/字級兩格標 `.ctl.wide` 跨滿）、按鈕 `min-height:44px`、`select/textarea/input` 強制 **16px**（**iOS 對 <16px 的表單控制項聚焦時會自動放大整頁**，這是 iOS 特有行為，不是字太小的問題）、邊距 22px→8px、`#canvasWrap` 改 `60svh`（`svh` 避開 Safari 動態網址列造成的 vh 跳動，前面留 `60vh` 當舊瀏覽器 fallback）。
- **切版面時 inline `style="display:none"` 會擋住 media query**：`#imgControls` 桌機是 flex、手機要 grid，但 JS 原本寫 `style.display='flex'`，inline 樣式贏過 media query。改成 `.hide{display:none!important}` class 開關（`imgControls`/`imgTools`/`modeTip`）。`#pageNav` 的 `'inline'` 也改成 `'flex'` 才吃得到 `gap`。
- 那段又臭又長的「顯示辨識框（點藍框＝…）」label 在手機上是一整片文字牆，拆成短 label ＋ `<details class="help">` 收合說明。
- 驗證：`node --check` ＋ **jsdom 51 項斷言**（`outputs/test_mobile.js`）—— 用 `bootAndRun()` 先 stub `matchMedia`/`innerWidth`/`getContext`/`getBoundingClientRect`/`scrollTop` 再注入 `<script>`（**JSDOM 建構時就會跑 script，來不及事後 stub**），然後直接呼叫 `canvas.onpointerdown/move/up` 餵假 pointer 物件。`let` 宣告的 `viewZoom`/`editMode`/`gest` 不是 `window` 的屬性，要用 `w.eval('viewZoom')` 才讀得到。同一份測試對 `和弦轉調工具.html` 與產出的 `docs/index.html` 各跑一次。

## 2026-07-31 — 上線 GitHub Pages：自帶第三方函式庫
- 架構：**單一原始碼** `和弦轉調工具.html`（本機用，走 CDN）→ `build_site.py` → `docs/index.html`（部署用，走 `docs/vendor/`）。build script 對每個替換都要求「正好命中 1 次」，沒命中就 `sys.exit`，避免升級版本後靜靜產出壞頁面；最後還會掃描產出檔，確認沒有殘留任何 `http(s)://` 外部資源。
- **最大的坑：worker 的相對路徑**。tesseract.js 預設用 **blob URL** 建立 Web Worker，worker 裡的 `importScripts('vendor/…')` 會相對於**網站根目錄**解析，在 GitHub Pages 專案頁 `https://user.github.io/repo/` 底下必 404。解法：頁面一開始算好同源絕對路徑 `const VENDOR=new URL('vendor/',location.href).href`，再把 `workerPath/corePath/langPath` 與 `pdfjsLib.GlobalWorkerOptions.workerSrc` 都指到它。已用 jsdom 驗證專案頁（子路徑）與使用者頁（根路徑）都正確。
- **要自帶哪些檔案是有講究的**（讀 `worker.min.js` 原始碼確認，不能亂猜）：
  - 語言包預設為 `https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng` + （`lstmOnly ? '/4.0.0_best_int' : '/4.0.0'`）。本工具 `createWorker('eng',1,…)` 的 `1` 是 **OEM=LSTM_ONLY** → 實際抓的是 **`4.0.0_best_int`（2.9MB）**，不是 `4.0.0`（10.9MB）。自帶時要挑對，否則辨識結果會跟原本不一樣。
  - core 選擇：`lstmOnly ? tesseract-core-simd-lstm.wasm.js : tesseract-core-simd.wasm.js`（無 SIMD 則去掉 `-simd`）。所以只需帶 `-lstm` 那兩組（含各自的 `.wasm`），不必帶全部 8 個檔（省 13MB）。
  - `corePath`/`langPath` 給**目錄**即可，tesseract 會自己接檔名。
- `.gz` 放靜態主機的疑慮（主機自動解壓 → 二次 gunzip 失敗）不存在：tesseract.js 會檢查 gzip magic（原始碼裡的 `31===` / `139===`）再決定要不要 inflate。
- vendor 合計約 18MB（首次載入才下載，之後瀏覽器快取）。GitHub Pages 免費方案：站台 ≤1GB、頻寬**軟**上限 100GB/月、免費方案需 **public repo**、條款禁止當商業 SaaS。要更寬鬆可原封不動改丟 Cloudflare Pages（官方 limits 頁沒有頻寬上限，單檔上限 25MiB —— 我們最大的檔 3.8MB，安全）。
- 沙箱不能用 curl/wget 抓檔，但**可以用 npm**：函式庫一律 `npm i` 後從 `node_modules/` 複製，順便也拿到正確版本與授權檔。

## 2026-07-31 — 環境踩坑：`.git/*.lock`、`tmp_obj_*` 一直殘留刪不掉
- 現象：每次 git 操作都噴 `warning: unable to unlink '.git/objects/xx/tmp_obj_xxxx'`、`unable to unlink '.git/HEAD.lock'`，下一次 git 就被 `fatal: Unable to create '.git/index.lock': File exists` 擋住。
- 原因：專案資料夾是以 **FUSE 掛載**進 AI 沙箱的，預設政策是「可建立、可寫入、**可 rename**，但**不可 unlink（刪除）**」（實測：`touch` 成功、`mv` 成功、`rm` 一律 `Operation not permitted`）。git 的收尾動作大量依賴 unlink：寫完物件後刪 `tmp_obj_*`、ref 交易結束後刪 `HEAD.lock`/`index.lock`。unlink 被拒 → 鎖檔殘留 → 下次 git 誤以為有其他 git 程序在跑。
- **不是** git 壞掉，也不是磁碟權限問題；commit 本身其實都成功了（rename 那步是通的），只有清理失敗。
- 解法（擇一）：
  1. **開啟該資料夾的刪除權限**（AI 呼叫 `allow_cowork_file_delete` 請求、使用者按同意）。開啟後實測 commit 完全乾淨、零殘留 —— **這是根治法**。
  2. 從 Windows 端自己跑 git（Git Bash / VS Code / GitHub Desktop），不受沙箱掛載限制。
  3. 沒有刪除權限時的臨時繞道：`GIT_INDEX_FILE=/tmp/idx git read-tree HEAD && git add -A && git write-tree` → `git commit-tree` → 直接把 commit hash **寫入** `.git/refs/heads/master`（純寫檔，不需 unlink），最後 `cp /tmp/idx .git/index`。
- 清理殘留：`find .git -name "tmp_obj*" -delete`、`find .git -name "*.lock" -delete`（含 `.git/objects/maintenance.lock`）。

## 2026-07-31 — 掃描件被誤判成文字譜 ＋ ♯ 被 OCR 讀成字母（A/C♯、F♯m 抓不到）
測試檔：讚美之泉《我全然獻上》五線譜掃描 1732×2420 JPG。**兩個獨立根因，第一個影響大得多。**
- **根因 1：`isStaff` 誤判**。原判準「dens>0.25 && run>0.5 的列數 ≥10」對這張只算出 **6 列** → 走文字譜路徑、譜線完全沒遮罩 → 整頁只抓到 2 個假和弦（`E`×2）。原因是掃描/JPEG 雜訊把譜線咬斷，最長連續段只到全寬 0.59（譜線本身也才佔全寬 ~0.70），過不了 0.5 的**絕對**門檻。
  - 修法：加第二判準 `run>0.3 && run>=dens*0.75`，即「這列的墨水有多集中在同一段」。真譜線的主段占該列墨量 ~0.95；簡譜節拍底線/歌詞列是很多短段，比值只有 0.04–0.3（合成資料實測），所以不會回歸 2026-07-31 早先修好的「簡譜被誤判成五線譜」。本檔 staffRows 6 → **23**。
  - 教訓：**掃描件不要用「佔全寬比例」這種絕對門檻**，要用形狀/比例特徵（連續性 = run/dens）。
- **根因 2：♯ 記號的 OCR 讀法**。tesseract 對本檔 ♯ 的實際輸出：`F♯m→Fem`、`D/F♯→D/Fi`、`A/C♯→A/C#`（少數正確）/`AICE`/`AICK`/`Alct`。
  - 修法 `sharpenToken()`：把「音名 `[A-Ga-g]` 後面緊接 1–2 個像♯的字元 `[eEiIltTkKhHfF4+xX]`，且後面是字尾/`/`/m/數字/sus/add/dim/aug/maj」換成 `#`，再回 `correctCore` 驗證。`AICE→AIC#`→（既有的 I→/ 規則）→`A/C#`。
  - **這個修正很積極**（`Get→G#`、`Fit→F#`、`Gem→G#m`、`Bee→B#`），所以**刻意不放進 `correctToken` 一般路徑**，只在兩處救援：`detectFrom` 內該行已有 ≥2 個確認和弦時（沿用字高比對 `h<=lh*1.6`），以及 `sparseCorrect`（本來就限定和弦列高度帶）。歌詞行湊不到 2 個和弦，救援不會啟動。
  - 既有的 `fails` 救援門檻維持 ≥3；♯ 救援用 ≥2（實測第 8 小節那行 OCR 只認得出 D、Bm 兩個）。
- **成效（同一張圖）**：舊版真實路徑 2 個假和弦 → 新版 36 個偵測，含 `A/C#`×3、`F#m`、`D/F#`、`D/A`、`G/A`、`E7` 等。
- **驗證管線（可重複）**：Python(PIL/numpy) 重現 `rowStats`＋遮罩前處理 → `tesseract --psm 3 tsv` → node 用 `new Function` 把 HTML 裡的 `correctCore/correctToken/sharpenToken/detectFrom` 原始碼**直接抽出來跑**（detectFrom 依賴 `scale`/`isStaff`，用工廠函式注入）→ 34 項斷言（♯ 案例、歌詞行必須 0 和弦、18 項既有誤讀修正不得退化）。舊版跑同一份測試只失敗新增的 3 個 ♯ 案例，證明無回歸。

## 2026-07-31 — 顯示縮放（不受原圖解析度影響）
- 問題：`#imgCanvas` 原本靠 `max-width:100%;height:auto` 決定畫面大小 → 大圖被壓到容器寬、小圖維持原尺寸，完全被來源解析度綁死。
- 作法：CSS 改 `max-width:none` + `margin:0 auto`，畫面大小改由 JS 明確設 `canvas.style.width/height = canvas.width/height × viewZoom`（**只改 CSS 顯示尺寸，canvas 位圖與 bbox 座標一律維持原圖像素**，所以 OCR/轉調/下載 PNG、PDF 完全不受影響）。
- 狀態機 `zoomMode`：`fitW`(符合寬度) / `fitP`(符合整頁) / `free`(手動)。`fitZoom()` 用 `canvasWrap.clientWidth`（扣 padding/border）與 `min(computed maxHeight, 75vh)` 算比例；`free` 以外的模式在 `renderImage()`、換頁、`window.resize` 時自動重算。載入完成後預設 `fitW`。
- 縮放入口：控制列 −/＋（×1.25 / ×0.8）、符合寬度、符合整頁、100%，以及 `canvasWrap` 上的 **Ctrl/⌘＋滾輪**（需 `{passive:false}` 才能 `preventDefault`）。滾輪縮放以游標為錨點：`scrollLeft=(scrollLeft+ax)*k-ax`。範圍 5%–800%。
- **座標容差要跟著 viewZoom 換算**：`canvasPos()` 本來就用 `canvas.width/rect.width` 所以自動正確，但寫死的像素門檻不會 —— 拖曳判定 `3px → 3/viewZoom`、`hitTest` 手把 `10/viewZoom`、框身容差 `5/viewZoom`。否則縮到 30% 時 1 螢幕 px = 3 圖 px，點一下就被判成拖曳。
- 驗證：抽 `<script>` 跑 `node --check`；另用 jsdom 載入頁面、stub `getContext`、灌入假 `canvas.width/height` 與 `clientWidth`，實測 3000px 大圖 fitW=30%、fitP=14%，400px 小圖 fitW=225%（會放大，符合預期）。

## 2026-07-31 — 簡譜被誤判為五線譜 → 最後一行和弦被遮罩塗掉
- 症狀（2.我唯一渴望.pdf）：最後一行和弦完全辨識不到。原因鏈：簡譜的節拍底線讓「密度>25% 的列」達 21 列（門檻 10）→ 誤判為五線譜 → 譜線遮罩把「密度>12%」的列塗白 → 最後一行和弦最寬最粗，自己的字身列超過 12% 被攔腰塗掉，OCR 前字就沒了。其他和弦行密度不夠高所以倖存 → 只有最後一行消失。
- 修法：`rowStats` 對每列同時算 dens（密度）與 run（**最長連續墨水段**佔寬比）。五線譜判定改為 `dens>0.25 && run>0.5`：真譜線是整行連續的（run≈0.8+），簡譜底線是斷段（此檔最高 0.52 僅 2 列，遠低於門檻 10）。遮罩內部邏輯不動（只有真五線譜才會進去），把 `rowDensity` 改名 `rowStats` 後遮罩取 `.dens`。
- 順手新增誤讀修正（皆通過 22 案例回歸測試）：`Gm/7→Gm7`（上標7前多讀出斜線；C/7 本非合法和弦無衝突）、`_Bb/C→Bb/C`（前導/尾隨 `_` 列入可剝除雜訊）、`Bom/F→Bbm/F`（♭讀成 o，限 [A-G]o 後接 m 形）。
- 驗證管線（無瀏覽器）：pdftoppm 依工具同樣縮放產圖 → Python 重現 rowStats/遮罩 → tesseract CLI 出 TSV → node 直接 eval HTML 內核心邏輯段跑 detectFrom 等價邏輯。CLI 是 tesseract 4、瀏覽器是 tesseract.js 5，結果近似但非完全相同。

## 2026-07-31 — 手動標註框拖曳/縮放＋全域字級
- 標註框資料結構：`pages[i].dets[] = {text, chord, bbox:{x0,y0,x1,y1}, on, manual?}`，座標為**原圖像素座標**；畫面顯示經 CSS 縮放，事件座標須乘 `canvas.width / getBoundingClientRect().width` 轉回。
- 互動改用 pointer events（`onpointerdown/move/up/cancel` + `setPointerCapture`）：位移 ≤3px 視為點擊（保留原本排除/刪除/補和弦行為），>3px 且按在綠框上才進入拖曳。點擊與拖曳共用同一組事件，不能再用 `onclick`（會與拖曳衝突）。
- 綠框縮放：右下角手把 `(x1+3, y1+3)`，以左上角為錨等比例縮放，最小 0.25 倍；改為統一字級後，縮放只影響覆蓋範圍，不再影響字級。
- 全域字級 `#imgFont`（range 50–300%）：**全頁統一字級**。`baseFontH(p)` 取「非手動框」框高中位數（無則取全部、再無則 `img.width/45`），`fs = baseFontH × fscale` 在迴圈外算一次，所有標註（OCR 藍框＋手動綠框）共用 → 滑桿一動全部一起變且大小一致。
  - 舊作法 `fs = 各框自己的 h × fscale` 會讓每個和弦字級不同（OCR bbox 高度本來就參差），且 while 迴圈按框寬縮字更放大差異；已整個移除該縮字迴圈（統一字級下按框寬縮字會破壞一致性）。
  - cover 模式的遮蓋矩形改為「原 bbox ∪ 實際文字範圍」：`ry0 = min(y0-3, base-fs)`、`rx1 = max(x1+3, x0+textWidth+3)`（`base = y1 - h×0.1`），否則字級調大後文字會溢出白底、原和弦露出來。
- `#imgCanvas` 需加 `touch-action:none`，否則觸控拖曳會被瀏覽器捲動吃掉。
- `handleR()` 用 function declaration（hoisting），因 `paintPage` 定義位置在它之前。
- 驗證方式：抽出 `<script>` 內容跑 `node --check`。
