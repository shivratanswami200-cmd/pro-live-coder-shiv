const mainCodeEl = document.getElementById('mainCode');
const snippetCodeEl = document.getElementById('snippetCode');
const previewFrame = document.getElementById('previewFrame');
const stageScaler = document.getElementById('stageScaler');
const canvasWrapper = document.getElementById('canvasWrapper');
const sizeBadge = document.getElementById('sizeBadge');
const renderTimeEl = document.getElementById('renderTime');
const statusText = document.getElementById('statusText');
const undoBtn = document.getElementById('undoBtn');
const sceneSelector = document.getElementById('sceneSelector');
const audioPlayer = document.getElementById('audioPlayer');
const cueListEl = document.getElementById('cueList');

let currentBlobUrl = null;
let debounceTimer = null;
let backupStack = [];
let currentScale = 1;
let lastRenderMs = 0;
let audioCues = [];

// Strict 1920x1080 Viewport Scaler (Never changes internal 1920x1080 layout)
function updateStageScale() {
  const pad = 32;
  const availW = canvasWrapper.clientWidth - pad;
  const availH = canvasWrapper.clientHeight - pad;
  if (availW <= 0 || availH <= 0) return;

  currentScale = Math.min(availW / 1920, availH / 1080);
  stageScaler.style.width = Math.round(1920 * currentScale) + 'px';
  stageScaler.style.height = Math.round(1080 * currentScale) + 'px';
  previewFrame.style.transform = `scale(${currentScale})`;
  renderTimeEl.textContent = `Scale: ${Math.round(currentScale * 100)}% | ${lastRenderMs} ms`;
}

window.addEventListener('resize', updateStageScale);
updateStageScale();

// Audio Loader & Cue Marker System
document.getElementById('audioInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  audioPlayer.src = URL.createObjectURL(file);
  audioCues = [];
  cueListEl.innerHTML = '<span>ऑडियो तैयार है — प्ले करके "Mark Cue Time" दबाएं</span>';
  showToast(`ऑडियो लोड हो गया: ${file.name}`);
});

function markAudioCue() {
  if (!audioPlayer.src) {
    showToast("पहले कोई ऑडियो फाइल लोड करें!");
    return;
  }
  const t = audioPlayer.currentTime.toFixed(1);
  audioCues.push(t);
  renderCues();
  navigator.clipboard.writeText(`At ${t}s`);
  showToast(`Cue मार्क किया गया: ${t}s (कॉपी हो गया)`);
}

function renderCues() {
  cueListEl.innerHTML = audioCues.map((sec, idx) =>
    `<span class="cue-tag" onclick="jumpToCue(${sec})" title="क्लिक करके इस सेकंड पर जाएं">Scene ${idx + 1}: ${sec}s</span>`
  ).join('');
}

function jumpToCue(sec) {
  audioPlayer.currentTime = parseFloat(sec);
  navigator.clipboard.writeText(`मेरे Pro Live HTML Coder प्रोजेक्ट में ठीक ${sec}s पर नया एनिमेशन/सीन जोड़ने का कोड दो।`);
  showToast(`${sec}s के लिए AI प्रॉम्प्ट कॉपी हो गया!`);
}

// Auto-Scan Scenes & IDs
function scanScenes(code) {
  const prevVal = sceneSelector.value;
  sceneSelector.innerHTML = `
    <option value="auto">🧠 Auto-Intelligence</option>
    <option value="cursor">📍 At Cursor Position</option>
    <option value="bodyEnd">⬇ End of &lt;/body&gt;</option>
  `;

  if (!code) return;
  const lines = code.split('\n');
  const foundIds = new Set();

  lines.forEach((line, idx) => {
    const idMatch = line.match(/id=["']([a-zA-Z0-9_-]+)["']/i);
    if (idMatch) {
      const idName = idMatch[1];
      if (!foundIds.has(idName) && foundIds.size < 45) {
        foundIds.add(idName);
        const opt = document.createElement('option');
        opt.value = `id:${idName}`;
        opt.textContent = `#${idName} (Line ${idx + 1})`;
        sceneSelector.appendChild(opt);
      }
    }
  });

  if (Array.from(sceneSelector.options).some(o => o.value === prevVal)) {
    sceneSelector.value = prevVal;
  }
}

function updateStats(code) {
  const bytes = new Blob([code]).size;
  const lineCount = code ? code.split('\n').length : 0;
  const kb = (bytes / 1024).toFixed(1);
  const mb = (bytes / (1024 * 1024)).toFixed(2);
  const isHeavy = lineCount > 3000 || bytes > 200 * 1024;
  const sizeStr = bytes > 1024 * 1024 ? `${mb} MB` : `${kb} KB`;
  sizeBadge.textContent = `Lines: ${lineCount.toLocaleString()} | ${sizeStr}`;
  return isHeavy;
}

function renderPreview(force = false) {
  const code = mainCodeEl.value;
  const isHeavy = updateStats(code);
  scanScenes(code);

  if (isHeavy && !force) {
    statusText.textContent = "बड़ी फाइल — अपडेट देखने के लिए '▶ Run' दबाएं";
    return;
  }

  const t0 = performance.now();
  if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
  const blob = new Blob([code], { type: 'text/html' });
  currentBlobUrl = URL.createObjectURL(blob);
  previewFrame.src = currentBlobUrl;

  previewFrame.onload = () => {
    lastRenderMs = Math.round(performance.now() - t0);
    updateStageScale();
    statusText.textContent = "Pixel-Locked 1920×1080 Active";
  };
}

mainCodeEl.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  const isHeavy = updateStats(mainCodeEl.value);
  if (!isHeavy) {
    debounceTimer = setTimeout(() => renderPreview(false), 500);
  }
});

function findElementRangeById(html, targetId) {
  const openRegex = new RegExp(`<([a-zA-Z0-9-]+)[^>]*\\bid=["']${targetId}["'][^>]*>`, 'i');
  const match = html.match(openRegex);
  if (!match) return null;

  const tagName = match[1].toLowerCase();
  const startIdx = match.index;
  const contentStartIdx = startIdx + match[0].length;

  const tagRegex = new RegExp(`<(\\/?)${tagName}\\b[^>]*>`, 'gi');
  tagRegex.lastIndex = contentStartIdx;
  let depth = 1;
  let m;
  while ((m = tagRegex.exec(html)) !== null) {
    if (m[1] === '/') depth--;
    else if (!m[0].endsWith('/>')) depth++;

    if (depth === 0) {
      return {
        start: startIdx,
        contentStart: contentStartIdx,
        contentEnd: m.index,
        end: m.index + m[0].length
      };
    }
  }
  return { start: startIdx, contentStart: contentStartIdx, contentEnd: contentStartIdx, end: contentStartIdx };
}

// Surgical Smart Merger with Guaranteed Fallback
function intelligentMerge() {
  let baseCode = mainCodeEl.value;
  const rawSnippet = snippetCodeEl.value.trim();

  if (!rawSnippet) {
    showToast("पहले नीचे वाले बॉक्स में कोड पेस्ट करें!");
    return;
  }

  if (backupStack.length >= 10) backupStack.shift();
  backupStack.push(baseCode);
  undoBtn.disabled = false;

  if (!baseCode.trim()) {
    baseCode = `<!DOCTYPE html>\n<html lang="hi">\n<head>\n  <meta charset="UTF-8">\n</head>\n<body>\n  <div id="stage"></div>\n</body>\n</html>`;
  }

  const replaceMatch = rawSnippet.match(/<!--\s*REPLACE_ID:\s*([a-zA-Z0-9_-]+)\s*-->/i);
  const insertInsideMatch = rawSnippet.match(/<!--\s*INSERT_SCENE:\s*([a-zA-Z0-9_-]+)\s*-->/i);
  const insertAfterMatch = rawSnippet.match(/<!--\s*INSERT_AFTER_ID:\s*([a-zA-Z0-9_-]+)\s*-->/i);

  const parser = new DOMParser();
  const snippetDoc = parser.parseFromString(rawSnippet, 'text/html');

  let extractedStyles = "";
  snippetDoc.querySelectorAll('style, link[rel="stylesheet"]').forEach(el => {
    extractedStyles += "\n" + el.outerHTML;
    el.remove();
  });

  let extractedScripts = "";
  snippetDoc.querySelectorAll('script').forEach(el => {
    extractedScripts += "\n" + el.outerHTML;
    el.remove();
  });

  const headExtras = Array.from(snippetDoc.head.children).map(el => el.outerHTML).join("\n");
  const bodyVisuals = [headExtras, snippetDoc.body.innerHTML.trim()].filter(Boolean).join("\n");

  if (extractedStyles.trim()) {
    const headCloseIdx = baseCode.toLowerCase().lastIndexOf('</head>');
    baseCode = headCloseIdx !== -1
      ? baseCode.slice(0, headCloseIdx) + `\n<!-- Merged CSS -->${extractedStyles}\n` + baseCode.slice(headCloseIdx)
      : extractedStyles + "\n" + baseCode;
  }

  let placementInfo = "Body End";
  if (bodyVisuals.trim()) {
    const manualMode = sceneSelector.value;
    let wasInserted = false;

    if (replaceMatch) {
      const range = findElementRangeById(baseCode, replaceMatch[1]);
      if (range) {
        baseCode = baseCode.slice(0, range.start) + bodyVisuals + baseCode.slice(range.end);
        placementInfo = `Replaced #${replaceMatch[1]}`;
        wasInserted = true;
      }
    } else if (insertAfterMatch) {
      const range = findElementRangeById(baseCode, insertAfterMatch[1]);
      if (range) {
        baseCode = baseCode.slice(0, range.end) + `\n${bodyVisuals}\n` + baseCode.slice(range.end);
        placementInfo = `After #${insertAfterMatch[1]}`;
        wasInserted = true;
      }
    } else if (insertInsideMatch || manualMode.startsWith('id:')) {
      const targetId = insertInsideMatch ? insertInsideMatch[1] : manualMode.replace('id:', '');
      if (targetId.toLowerCase() !== 'body') {
        const range = findElementRangeById(baseCode, targetId);
        if (range) {
          baseCode = baseCode.slice(0, range.contentEnd) + `\n${bodyVisuals}\n` + baseCode.slice(range.contentEnd);
          placementInfo = `Inside #${targetId}`;
          wasInserted = true;
        }
      }
    } else if (manualMode === 'cursor') {
      const cursorPos = mainCodeEl.selectionStart || baseCode.length;
      baseCode = baseCode.slice(0, cursorPos) + `\n${bodyVisuals}\n` + baseCode.slice(cursorPos);
      placementInfo = "At Cursor";
      wasInserted = true;
    } else {
      const sceneHint = rawSnippet.match(/(scene[-_]?\d+|stage|map[-_]?container|timeline)/i);
      if (sceneHint) {
        const range = findElementRangeById(baseCode, sceneHint[1]);
        if (range) {
          baseCode = baseCode.slice(0, range.contentEnd) + `\n${bodyVisuals}\n` + baseCode.slice(range.contentEnd);
          placementInfo = `Auto-Matched #${sceneHint[1]}`;
          wasInserted = true;
        }
      }
    }

    if (!wasInserted) {
      const bodyCloseIdx = baseCode.toLowerCase().lastIndexOf('</body>');
      baseCode = bodyCloseIdx !== -1
        ? baseCode.slice(0, bodyCloseIdx) + `\n${bodyVisuals}\n` + baseCode.slice(bodyCloseIdx)
        : baseCode + `\n${bodyVisuals}`;
    }
  }

  if (extractedScripts.trim()) {
    const bodyCloseIdx = baseCode.toLowerCase().lastIndexOf('</body>');
    baseCode = bodyCloseIdx !== -1
      ? baseCode.slice(0, bodyCloseIdx) + `\n<!-- Merged Script -->${extractedScripts}\n` + baseCode.slice(bodyCloseIdx)
      : baseCode + `\n${extractedScripts}`;
  }

  mainCodeEl.value = baseCode;
  snippetCodeEl.value = "";
  renderPreview(true);
  showToast(`✨ स्मार्ट मर्ज सफल (${placementInfo})`);
}

function copyPromptRule() {
  const ruleText = `मेरे पास "Pro Live HTML Coder" टूल है (1920x1080 Fixed Stage)। जब भी तुम मुझे नया HTML/CSS/SVG/JS कोड या कोई अपडेट दो, तो उसमें ये स्मार्ट मार्कर्स ज़रूर लगाना ताकि मेरा टूल उसे सही लाइन पर ऑटो-मर्ज कर सके:\n1. किसी सीन या कंटेनर के अंदर जोड़ने के लिए सबसे ऊपर लिखो: <!-- INSERT_SCENE: scene_id -->\n2. किसी पुराने हिस्से को बदलने के लिए लिखो: <!-- REPLACE_ID: target_id -->\n3. किसी एलिमेंट के ठीक नीचे जोड़ने के लिए लिखो: <!-- INSERT_AFTER_ID: target_id -->\nकोड हमेशा 1920x1080 फिक्स्ड कैनवास के हिसाब से देना।`;
  navigator.clipboard.writeText(ruleText);
  showToast("AI प्रोटोकॉल कॉपी हो गया! नई चैट में इसे पेस्ट कर दें।");
}

// Export Single Self-Contained 1920x1080 + Mobile Fullscreen HTML for Screen Recording
function downloadCode() {
  let finalCode = mainCodeEl.value;
  if (!finalCode.trim()) return;

  if (!finalCode.includes('id="strict-1080p-lock"')) {
    const lockStyle = `
<style id="strict-1080p-lock">
  html {
    background: #000000 !important;
    width: 100% !important;
    height: 100% !important;
    overflow: hidden !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  body {
    width: 1920px !important;
    height: 1080px !important;
    min-width: 1920px !important;
    max-width: 1920px !important;
    min-height: 1080px !important;
    max-height: 1080px !important;
    overflow: hidden !important;
    position: relative !important;
    transform-origin: center center !important;
    flex-shrink: 0 !important;
    margin: 0 !important;
    will-change: transform;
  }
</style>`;

    const lockScript = `
<script>
  (function lockExact1080pMobileReady() {
    function fitExactCanvas() {
      const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
      const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      const scale = Math.min(vw / 1920, vh / 1080);
      document.body.style.transform = 'scale(' + scale + ')';
    }
    window.addEventListener('resize', fitExactCanvas);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', fitExactCanvas);
    fitExactCanvas();

    function enterMobileFullscreen() {
      const el = document.documentElement;
      if (!document.fullscreenElement) {
        const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
        if (req) {
          req.call(el).then(() => {
            if (screen.orientation && screen.orientation.lock) {
              screen.orientation.lock('landscape').catch(() => {});
            }
            setTimeout(fitExactCanvas, 150);
          }).catch(() => {});
        }
      }
    }
    document.addEventListener('click', enterMobileFullscreen, { capture: true });
  })();
<\/script>`;

    const headIdx = finalCode.toLowerCase().lastIndexOf('</head>');
    finalCode = headIdx !== -1 ? finalCode.slice(0, headIdx) + lockStyle + "\n" + finalCode.slice(headIdx) : lockStyle + "\n" + finalCode;

    const bodyIdx = finalCode.toLowerCase().lastIndexOf('</body>');
    finalCode = bodyIdx !== -1 ? finalCode.slice(0, bodyIdx) + lockScript + "\n" + finalCode.slice(bodyIdx) : finalCode + "\n" + lockScript;
  }

  const blob = new Blob([finalCode], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'final_1920x1080_video.html';
  a.click();
  showToast("1920×1080 फाइल डाउनलोड हो गई — अब आप इसे स्क्रीन रिकॉर्ड कर सकते हैं!");
}

function undoMerge() {
  if (backupStack.length === 0) return;
  mainCodeEl.value = backupStack.pop();
  if (backupStack.length === 0) undoBtn.disabled = true;
  renderPreview(true);
  showToast("पिछला बदलाव वापस (Undo) कर दिया गया!");
}

function loadFile() { document.getElementById('fileInput').click(); }
document.getElementById('fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    mainCodeEl.value = ev.target.result;
    renderPreview(true);
    showToast(`फाइल लोड हो गई (${file.name})`);
  };
  reader.readAsText(file);
});

function clearMain() {
  backupStack.push(mainCodeEl.value);
  undoBtn.disabled = false;
  mainCodeEl.value = '';
  updateStats('');
  scanScenes('');
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}
