// ============================================================
// State
// ============================================================
const state = {
  step: 1,
  file: null,
  buffer: null,          // ArrayBuffer of the uploaded DOCX
  placeholders: { simple: [], loops: [] },
  content: {},           // { fieldName: generatedValue }
};

// ============================================================
// DOM helpers
// ============================================================
const $ = (id) => document.getElementById(id);
const panel = (n) => $(`panel-${n}`);
const stepEl = (n) => document.querySelector(`.step-item[data-step="${n}"]`);

// ============================================================
// File upload
// ============================================================
const dropZone = $('dropZone');
const fileInput = $('fileInput');

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f) setFile(f);
});
fileInput.addEventListener('change', () => { if (fileInput.files[0]) setFile(fileInput.files[0]); });

$('clearFile').addEventListener('click', () => {
  state.file = null;
  state.buffer = null;
  $('filePreview').classList.add('hidden');
  dropZone.classList.remove('hidden');
  $('btn-1-next').disabled = true;
  fileInput.value = '';
});

function setFile(file) {
  if (!file.name.toLowerCase().endsWith('.docx')) {
    alert('Please upload a .docx file.');
    return;
  }
  state.file = file;
  $('fileName').textContent = file.name;
  $('fileSize').textContent = formatBytes(file.size);
  $('filePreview').classList.remove('hidden');
  dropZone.classList.add('hidden');
  $('btn-1-next').disabled = false;
}

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

// ============================================================
// Step 1 → 2: scan template for placeholders
// ============================================================
$('btn-1-next').addEventListener('click', async () => {
  const btn = $('btn-1-next');
  btn.disabled = true;
  btn.textContent = 'Scanning…';
  try {
    state.buffer = await state.file.arrayBuffer();
    const zip = new PizZip(state.buffer);
    state.placeholders = extractPlaceholders(zip);
    renderFieldsPanel();
    goToStep(2);
  } catch (err) {
    alert('Failed to read template: ' + err.message);
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Scan for Fields →';
  }
});

function extractPlaceholders(zip) {
  const simple = new Set();
  const loops = new Set();

  const xmlFiles = Object.keys(zip.files).filter(
    (n) => n.startsWith('word/') && n.endsWith('.xml')
  );

  for (const name of xmlFiles) {
    const xml = zip.files[name].asText();

    // Concatenate all <w:t> text nodes — handles OOXML splitting a
    // placeholder like {title} across multiple runs.
    const pieces = [];
    const wtRe = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let m;
    while ((m = wtRe.exec(xml)) !== null) pieces.push(m[1]);
    const text = pieces.join('');

    // {#loopName}
    const loopRe = /\{#([^{}/\s]+?)\}/g;
    while ((m = loopRe.exec(text)) !== null) loops.add(m[1]);

    // {varName} — skip {#...} {/...} {.}
    const varRe = /\{([^{}/# ][^{}/]*?)\}/g;
    while ((m = varRe.exec(text)) !== null) {
      const v = m[1].trim();
      if (!loops.has(v)) simple.add(v);
    }
  }

  return { simple: [...simple], loops: [...loops] };
}

function renderFieldsPanel() {
  const container = $('fields-container');
  const noMsg = $('no-fields-msg');
  const total = state.placeholders.simple.length + state.placeholders.loops.length;

  if (total === 0) {
    container.innerHTML = '';
    noMsg.classList.remove('hidden');
    return;
  }
  noMsg.classList.add('hidden');

  let html = '';
  if (state.placeholders.simple.length) {
    html += '<h3 class="section-label">Text Fields</h3><div class="tag-list">';
    for (const v of state.placeholders.simple) html += `<span class="tag tag-text">{${v}}</span>`;
    html += '</div>';
  }
  if (state.placeholders.loops.length) {
    html += '<h3 class="section-label">Table / List Fields</h3><div class="tag-list">';
    for (const v of state.placeholders.loops)
      html += `<span class="tag tag-loop">{#${v}}…{/${v}}</span>`;
    html += '</div>';
  }
  container.innerHTML = html;
}

// ============================================================
// Navigation
// ============================================================
$('btn-2-back').addEventListener('click', () => goToStep(1));
$('btn-2-next').addEventListener('click', () => {
  if (!state.placeholders.simple.length && !state.placeholders.loops.length) {
    alert('No placeholders found. Add {field_name} tags to your template first.');
    return;
  }
  goToStep(3);
});
$('btn-3-back').addEventListener('click', () => goToStep(2));
$('btn-3-generate').addEventListener('click', startGeneration);
$('btn-4-back').addEventListener('click', () => goToStep(3));
$('btn-4-back-err').addEventListener('click', () => goToStep(3));
$('btn-retry').addEventListener('click', startGeneration);
$('btn-regenerate').addEventListener('click', startGeneration);
$('btn-download').addEventListener('click', downloadDocument);

function goToStep(n) {
  [1, 2, 3, 4].forEach((i) => {
    panel(i).classList.toggle('hidden', i !== n);
    const s = stepEl(i);
    s.classList.remove('active', 'done');
    if (i === n) s.classList.add('active');
    else if (i < n) s.classList.add('done');
  });
  state.step = n;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// AI generation
// ============================================================
async function startGeneration() {
  const topic = $('topicInput').value.trim();
  const apiKey = $('apiKeyInput').value.trim();

  if (!topic) { alert('Please enter a document topic.'); return; }
  if (!apiKey) { alert('Please enter your Gemini API key.'); return; }

  // Persist key so user doesn't have to re-enter
  try { localStorage.setItem('docai_gemini_key', apiKey); } catch (_) {}

  goToStep(4);
  $('progress-block').classList.remove('hidden');
  $('error-block').classList.add('hidden');
  $('result-block').classList.add('hidden');

  const docType = $('docTypeSelect').value;
  const style = $('styleSelect').value;
  const instructions = $('instructionsInput').value.trim();

  setProgress(10, 'Building prompt…');
  const prompt = buildPrompt(topic, docType, style, instructions, state.placeholders);

  setProgress(30, 'Calling Gemini API…');
  let raw;
  try {
    raw = await callGemini(apiKey, prompt);
  } catch (err) {
    showError(err.message);
    return;
  }

  setProgress(80, 'Parsing response…');
  let content;
  try {
    content = parseJsonResponse(raw);
  } catch (err) {
    showError(
      'Could not parse AI response as JSON.\n\n' + err.message +
      '\n\nRaw response (first 600 chars):\n' + raw.slice(0, 600)
    );
    return;
  }

  state.content = content;
  setProgress(100, 'Done!');

  setTimeout(() => {
    $('progress-block').classList.add('hidden');
    renderContentEditor(content);
    $('result-block').classList.remove('hidden');
  }, 300);
}

function buildPrompt(topic, docType, style, instructions, placeholders) {
  const simpleLines = placeholders.simple.map((v) => `  - {${v}}`).join('\n');
  const loopLines = placeholders.loops
    .map((v) => `  - {#${v}} … {/${v}}  (generate as an array of row-objects)`)
    .join('\n');

  const fieldBlock = [
    simpleLines && `Text placeholders (plain string values):\n${simpleLines}`,
    loopLines && `Repeating/table placeholders (array of objects):\n${loopLines}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const extra = instructions ? `\nAdditional instructions: ${instructions}` : '';

  return `You are a professional content writer.
Generate content for a ${style} ${docType} on the topic: "${topic}".${extra}

The document template contains these fields that need content:
${fieldBlock}

Rules:
1. Return ONLY a single valid JSON object — no markdown, no code fences, no explanation.
2. Each key matches exactly the placeholder name (without braces).
3. For text fields: plain text, no markdown (no **, ##, -, *, backticks). Use \\n for paragraph breaks.
4. For array/table fields: array of objects with meaningful, consistent column keys.
5. Content must be detailed, accurate, and appropriate for the field name and document context.
6. Math or equations: write them as readable text (e.g., "E = mc^2" or LaTeX: "$E = mc^{2}$").

Respond with raw JSON only.`;
}

async function callGemini(apiKey, prompt) {
  // Try newer model first, fall back to gemini-1.5-flash which has a stable free tier
  const models = ['gemini-2.0-flash-lite', 'gemini-1.5-flash'];
  let lastErr;

  for (const model of models) {
    let res;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
          }),
        }
      );
    } catch (err) {
      lastErr = new Error('Network error: ' + err.message);
      continue;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = body?.error?.message || `HTTP ${res.status}`;
      if (res.status === 404) { lastErr = new Error(msg); continue; }
      throw new Error(msg);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response from Gemini.');
    return text;
  }

  throw lastErr || new Error('All Gemini models failed.');
}

function parseJsonResponse(raw) {
  // Strip markdown code fences if present
  let s = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  // Extract the outermost {...}
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in response.');
  return JSON.parse(s.slice(start, end + 1));
}

function setProgress(pct, label) {
  $('progress-bar').style.width = pct + '%';
  $('progress-label').textContent = label;
}

function showError(msg) {
  $('progress-block').classList.add('hidden');
  $('error-block').classList.remove('hidden');
  $('error-text').textContent = msg;
}

// ============================================================
// Content editor
// ============================================================
function renderContentEditor(content) {
  const container = $('content-editor');
  let html = '<div class="content-table">';

  for (const [key, value] of Object.entries(content)) {
    const isArray = Array.isArray(value);

    if (isArray) {
      const cols = value.length ? Object.keys(value[0]) : [];
      let tableHtml = `<table class="array-preview"><thead><tr>${cols.map((c) => `<th>${escHtml(c)}</th>`).join('')}</tr></thead><tbody>`;
      for (const row of value) {
        tableHtml += `<tr>${cols.map((c) => `<td>${escHtml(String(row[c] ?? ''))}</td>`).join('')}</tr>`;
      }
      tableHtml += '</tbody></table>';
      html += `
        <div class="content-row">
          <div class="content-key"><code>{#${escHtml(key)}}</code><span class="tag-note">${value.length} row(s)</span></div>
          <div class="content-val">${tableHtml}<span class="field-note">Edit the JSON directly in the textarea below.</span>
            <textarea class="content-edit array-edit" data-key="${escHtml(key)}" rows="5">${escHtml(JSON.stringify(value, null, 2))}</textarea>
          </div>
        </div>`;
    } else {
      const str = String(value);
      const rows = Math.min(8, Math.max(2, str.split('\n').length + 1));
      html += `
        <div class="content-row">
          <div class="content-key"><code>{${escHtml(key)}}</code></div>
          <div class="content-val">
            <textarea class="content-edit" data-key="${escHtml(key)}" rows="${rows}">${escHtml(str)}</textarea>
          </div>
        </div>`;
    }
  }

  html += '</div>';
  container.innerHTML = html;

  // Sync edits back to state.content
  container.querySelectorAll('.content-edit').forEach((ta) => {
    ta.addEventListener('input', () => {
      const k = ta.dataset.key;
      if (ta.classList.contains('array-edit')) {
        try { state.content[k] = JSON.parse(ta.value); } catch (_) { /* keep old */ }
      } else {
        state.content[k] = ta.value;
      }
    });
  });
}

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
// Download filled document
// ============================================================
function downloadDocument() {
  if (!window.PizZip || !window.Docxtemplater) {
    alert('Required libraries not loaded. Check your internet connection and reload.');
    return;
  }
  try {
    const zip = new PizZip(state.buffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    doc.render(state.content);

    const blob = doc.getZip().generate({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      compression: 'DEFLATE',
    });

    const outName = state.file.name.replace(/\.docx$/i, '') + '_filled.docx';
    saveAs(blob, outName);
  } catch (err) {
    // docxtemplater wraps errors; extract the inner message when possible
    const msg = err?.properties?.errors?.map?.((e) => e.message).join('\n') || err.message;
    alert('Error generating document:\n' + msg);
    console.error(err);
  }
}

// ============================================================
// Init
// ============================================================
try {
  const saved = localStorage.getItem('docai_gemini_key');
  if (saved) $('apiKeyInput').value = saved;
} catch (_) {}
