// ============================================================================
// AiQuestion —— 客户端设置面板（可拖动齿轮 + 面板，零依赖）
// ----------------------------------------------------------------------------
// 由插件通过 tapIndex 注入到 Web 首页；配置走 /dsh-aiquestion/config.json。
// 与 AIQuit 的面板同构（同一位作者生态），改为展示 AiQuestion 的澄清参数。
// ============================================================================
export const WIDGET_JS = `(function () {
if (window.__dshAiQuestion) return
window.__dshAiQuestion = true

var CFG_URL = '/dsh-aiquestion/config.json'
var POS_KEY = 'dsh-aiquestion-pos'
var SZ = 42

var css = [
  '.dsaq-root{position:fixed;z-index:2147483000;font-family:system-ui,"Microsoft YaHei",sans-serif;user-select:none;-webkit-user-select:none}',
  '.dsaq-gear{width:' + SZ + 'px;height:' + SZ + 'px;display:flex;align-items:center;justify-content:center;cursor:grab;border-radius:50%;background:rgba(48,90,214,.12);border:1px solid rgba(48,90,214,.35);color:#2f5ad6;box-shadow:0 2px 10px rgba(0,0,0,.15);transition:background .15s,transform .15s}',
  '.dsaq-gear:hover{background:rgba(48,90,214,.22)}',
  '.dsaq-gear.dsaq-drag{cursor:grabbing;transform:scale(1.08)}',
  '.dsaq-gear svg{width:24px;height:24px;pointer-events:none}',
  '.dsaq-panel{position:absolute;right:0;bottom:calc(100% + 12px);width:312px;max-height:70vh;overflow:auto;background:rgba(255,255,255,.98);border:1px solid rgba(48,90,214,.3);border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.2);padding:14px;display:none;color:#22305a}',
  '.dsaq-panel.dsaq-open{display:block}',
  '.dsaq-title{font-size:14px;font-weight:800;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center}',
  '.dsaq-sub{color:#8a97bd;font-weight:600;font-size:12px}',
  '.dsaq-close{cursor:pointer;border:none;background:none;color:#22305a;font-size:15px;padding:0 4px;line-height:1}',
  '.dsaq-enline{display:flex;justify-content:space-between;align-items:center}',
  '.dsaq-toggle{display:inline-flex;flex:0 0 auto;width:40px;height:22px;border-radius:11px;background:rgba(48,90,214,.25);cursor:pointer;position:relative;transition:background .15s}',
  '.dsaq-toggle.dsaq-on{background:#2fa24c}',
  '.dsaq-toggle .dsaq-knob{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;transition:left .15s;box-shadow:0 1px 3px rgba(0,0,0,.25)}',
  '.dsaq-toggle.dsaq-on .dsaq-knob{left:20px}',
  '.dsaq-row{margin:11px 0}',
  '.dsaq-row.dsaq-off{opacity:.45;pointer-events:none}',
  '.dsaq-label{font-size:12px;font-weight:700;margin-bottom:4px}',
  '.dsaq-hint{font-size:11px;color:#8a97bd;margin-top:3px;line-height:1.45}',
  '.dsaq-thr{display:flex;align-items:center;gap:8px}',
  '.dsaq-range{flex:1;min-width:0;accent-color:#2f5ad6;cursor:pointer}',
  '.dsaq-num{font-weight:800;font-size:17px;min-width:26px;text-align:right}',
  '.dsaq-libs{display:flex;gap:6px}',
  '.dsaq-lib{flex:1;border:1px solid rgba(48,90,214,.35);border-radius:9px;padding:7px 2px;text-align:center;cursor:pointer;font-size:12px;font-weight:700;background:#fff}',
  '.dsaq-lib:hover{background:rgba(48,90,214,.06)}',
  '.dsaq-lib.dsaq-sel{background:rgba(48,90,214,.14);border-color:#2f5ad6}',
  '.dsaq-lib small{display:block;color:#8a97bd;font-weight:400;margin-top:2px}',
  '.dsaq-modes{display:flex;gap:6px}',
  '.dsaq-mode{flex:1;border:1px solid rgba(48,90,214,.35);border-radius:9px;padding:7px 2px;text-align:center;cursor:pointer;font-size:12px;font-weight:700;background:#fff}',
  '.dsaq-mode.dsaq-sel{background:rgba(48,90,214,.14);border-color:#2f5ad6}',
  '.dsaq-preview{margin-top:12px;background:rgba(48,90,214,.07);border-radius:9px;padding:8px 10px;font-size:12px;line-height:1.55;color:#35406b;max-height:120px;overflow:auto;white-space:pre-wrap;word-break:break-all}'
].join('\\n')

var styleEl = document.createElement('style')
styleEl.textContent = css
document.head.appendChild(styleEl)

var root = document.createElement('div')
root.className = 'dsaq-root'

var gear = document.createElement('div')
gear.className = 'dsaq-gear'
gear.title = 'AiQuestion · 先问清楚再动手（点击打开设置）'
gear.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 13a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0-13c.55 0 1.09.05 1.61.13l.35 2.1c.6.2 1.16.46 1.67.79l1.9-.98c.86.75 1.57 1.63 2.09 2.62l-1.5 1.5c.16.55.26 1.13.3 1.72l2.1.35c.05.52.08 1.06.08 1.61s-.03 1.09-.09 1.61l-2.1.35c-.04.6-.14 1.17-.3 1.72l1.5 1.5a9.9 9.9 0 0 1-2.09 2.62l-1.9-.98c-.51.33-1.07.59-1.67.79l-.35 2.1c-.52.08-1.06.13-1.61.13s-1.09-.05-1.61-.13l-.35-2.1c-.6-.2-1.16-.46-1.67-.79l-1.9.98a9.9 9.9 0 0 1-2.09-2.62l1.5-1.5c-.16-.55-.26-1.13-.3-1.72l-2.1-.35A10.3 10.3 0 0 1 2 12c0-.55.03-1.09.09-1.61l2.1-.35c.04-.6.14-1.17.3-1.72l-1.5-1.5a9.9 9.9 0 0 1 2.09-2.62l1.9.98c.51-.33 1.07-.59 1.67-.79l.35-2.1C10.91 2.05 11.45 2 12 2z"/></svg>'

var panel = document.createElement('div')
panel.className = 'dsaq-panel'

var title = document.createElement('div')
title.className = 'dsaq-title'
var titleText = document.createElement('span')
titleText.innerHTML = 'AiQuestion <span class="dsaq-sub">先问清楚再动手</span>'
var closeBtn = document.createElement('button')
closeBtn.type = 'button'
closeBtn.className = 'dsaq-close'
closeBtn.textContent = '✕'
closeBtn.addEventListener('click', closePanel)
title.appendChild(titleText)
title.appendChild(closeBtn)
panel.appendChild(title)

// 总开关
var enRow = document.createElement('div')
enRow.className = 'dsaq-row'
var enLine = document.createElement('div')
enLine.className = 'dsaq-enline'
var enLabel = document.createElement('div')
enLabel.className = 'dsaq-label'
enLabel.style.marginBottom = '0'
enLabel.textContent = '启用 AiQuestion'
var enToggle = document.createElement('div')
enToggle.className = 'dsaq-toggle'
var enKnob = document.createElement('div')
enKnob.className = 'dsaq-knob'
enToggle.appendChild(enKnob)
enLine.appendChild(enLabel)
enLine.appendChild(enToggle)
var enHint = document.createElement('div')
enHint.className = 'dsaq-hint'
enRow.appendChild(enLine)
enRow.appendChild(enHint)
panel.appendChild(enRow)

// 触发模式
var modeRow = document.createElement('div')
modeRow.className = 'dsaq-row'
var modeLabel = document.createElement('div')
modeLabel.className = 'dsaq-label'
modeLabel.textContent = '触发模式'
var modeBox = document.createElement('div')
modeBox.className = 'dsaq-modes'
modeRow.appendChild(modeLabel)
modeRow.appendChild(modeBox)
var modeHint = document.createElement('div')
modeHint.className = 'dsaq-hint'
modeHint.textContent = '智能：仅意图含糊或工作量大时澄清（最省 token）；总是：每轮先澄清；关闭：不干预。'
modeRow.appendChild(modeHint)
panel.appendChild(modeRow)

// 工作量阈值
var thrRow = document.createElement('div')
thrRow.className = 'dsaq-row'
var thrLabel = document.createElement('div')
thrLabel.className = 'dsaq-label'
thrLabel.textContent = '工作量阈值'
var thrInner = document.createElement('div')
thrInner.className = 'dsaq-thr'
var thrRange = document.createElement('input')
thrRange.type = 'range'
thrRange.min = '1'
thrRange.max = '10'
thrRange.step = '1'
thrRange.className = 'dsaq-range'
var thrNum = document.createElement('span')
thrNum.className = 'dsaq-num'
thrInner.appendChild(thrRange)
thrInner.appendChild(thrNum)
var thrHint = document.createElement('div')
thrHint.className = 'dsaq-hint'
thrHint.textContent = '预估工作量 ≥ 该值即触发澄清（1=什么都问，10=几乎不问）。'
thrRow.appendChild(thrLabel)
thrRow.appendChild(thrInner)
thrRow.appendChild(thrHint)
panel.appendChild(thrRow)

// 追问轮数上限
var rndRow = document.createElement('div')
rndRow.className = 'dsaq-row'
var rndLabel = document.createElement('div')
rndLabel.className = 'dsaq-label'
rndLabel.textContent = '最多追问轮数'
var rndInner = document.createElement('div')
rndInner.className = 'dsaq-thr'
var rndRange = document.createElement('input')
rndRange.type = 'range'
rndRange.min = '0'
rndRange.max = '5'
rndRange.step = '1'
rndRange.className = 'dsaq-range'
var rndNum = document.createElement('span')
rndNum.className = 'dsaq-num'
rndInner.appendChild(rndRange)
rndInner.appendChild(rndNum)
var rndHint = document.createElement('div')
rndHint.className = 'dsaq-hint'
rndHint.textContent = '超过该轮数仍未问清，AI 以自身判断决断并开工。'
rndRow.appendChild(rndLabel)
rndRow.appendChild(rndInner)
rndRow.appendChild(rndHint)
panel.appendChild(rndRow)

// 提问风格
var libRow = document.createElement('div')
libRow.className = 'dsaq-row'
var libLabel = document.createElement('div')
libLabel.className = 'dsaq-label'
libLabel.textContent = '提问风格'
var libs = document.createElement('div')
libs.className = 'dsaq-libs'
libRow.appendChild(libLabel)
libRow.appendChild(libs)
panel.appendChild(libRow)

var preview = document.createElement('div')
preview.className = 'dsaq-preview'
panel.appendChild(preview)

root.appendChild(gear)
root.appendChild(panel)
document.body.appendChild(root)

var cfg = null
var enabled = true
var curMode = 'auto'
var curLib = 'engineer'

function applyEnabledState() {
  enToggle.classList.toggle('dsaq-on', enabled)
  modeRow.classList.toggle('dsaq-off', !enabled)
  thrRow.classList.toggle('dsaq-off', !enabled)
  rndRow.classList.toggle('dsaq-off', !enabled)
  libRow.classList.toggle('dsaq-off', !enabled)
  enHint.textContent = enabled
    ? '意图含糊或工作量大时，AI 先提问再动手；清晰的小请求零干预放行。'
    : '已停用：每轮直接放行，不产生任何额外 token 消耗。'
  gear.style.opacity = enabled ? '' : '0.55'
}

enToggle.addEventListener('click', function () {
  enabled = !enabled
  applyEnabledState()
  saveCfg({ enabled: enabled })
})

function renderModes() {
  modeBox.innerHTML = ''
  var order = [['auto', '智能'], ['always', '总是'], ['never', '关闭']]
  for (var i = 0; i < order.length; i++) {
    var id = order[i][0]
    var b = document.createElement('div')
    b.className = 'dsaq-mode' + (curMode === id ? ' dsaq-sel' : '')
    b.textContent = order[i][1]
    ;(function (mid) {
      b.addEventListener('click', function () {
        if (mid === curMode) return
        saveCfg({ mode: mid })
      })
    })(id)
    modeBox.appendChild(b)
  }
}

function renderLibs() {
  libs.innerHTML = ''
  var order = ['engineer', 'sassy', 'mentor']
  for (var i = 0; i < order.length; i++) {
    var id = order[i]
    var meta = cfg && cfg.libraries && cfg.libraries[id] ? cfg.libraries[id] : null
    var b = document.createElement('div')
    b.className = 'dsaq-lib' + (curLib === id ? ' dsaq-sel' : '')
    var nm = document.createElement('span')
    nm.textContent = (meta && meta.name) || id
    var file = document.createElement('small')
    file.textContent = (meta ? meta.count + ' 条' : '')
    b.appendChild(nm)
    b.appendChild(file)
    ;(function (lid) {
      b.addEventListener('click', function () {
        if (lid === curLib) return
        saveCfg({ talking: lid })
      })
    })(id)
    libs.appendChild(b)
  }
}

function renderPreview(d) {
  var lines = []
  var s = d && d.lastStatus
  if (s) {
    var when = s.at ? new Date(s.at).toLocaleTimeString() : ''
    if (s.action === 'ask') {
      lines.push('最近：已向用户提问（第 ' + (s.round || 1) + ' 轮' + (s.workload ? '，工作量 ' + s.workload + '/10' : '') + '）' + (when ? ' · ' + when : ''))
    } else if (s.action === 'contract') {
      lines.push('最近：意图已确认，生成契约并开工' + (when ? ' · ' + when : ''))
    } else {
      lines.push('最近：意图清晰，直接放行' + (s.workload ? '（工作量 ' + s.workload + '/10）' : '') + (when ? ' · ' + when : ''))
    }
    if (s.verdict) lines.push('裁决：' + s.verdict)
  } else {
    lines.push('最近：暂无记录')
  }
  lines.push('')
  lines.push('示例提问语：')
  lines.push(d && d.preview ? d.preview : '')
  preview.textContent = lines.join('\\n')
}

function openPanel() {
  panel.classList.add('dsaq-open')
  loadCfg()
}
function closePanel() {
  panel.classList.remove('dsaq-open')
}
function togglePanel() {
  if (panel.classList.contains('dsaq-open')) closePanel()
  else openPanel()
}

function render(d) {
  if (!d || !d.ok) return
  cfg = d
  enabled = d.enabled !== false
  curMode = d.mode || 'auto'
  curLib = d.talking || 'engineer'
  thrRange.value = String(d.workloadThreshold)
  thrNum.textContent = String(d.workloadThreshold)
  rndRange.value = String(d.maxRounds)
  rndNum.textContent = String(d.maxRounds)
  applyEnabledState()
  renderModes()
  renderLibs()
  renderPreview(d)
}

function loadCfg() {
  fetch(CFG_URL, { cache: 'no-store' })
    .then(function (r) { return r.json() })
    .then(render)
    .catch(function () {})
}

function saveCfg(patch) {
  fetch(CFG_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  })
    .then(function (r) { return r.json() })
    .then(render)
    .catch(function () {})
}

thrRange.addEventListener('input', function () {
  thrNum.textContent = thrRange.value
})
thrRange.addEventListener('change', function () {
  saveCfg({ workloadThreshold: Number(thrRange.value) })
})
rndRange.addEventListener('input', function () {
  rndNum.textContent = rndRange.value
})
rndRange.addEventListener('change', function () {
  saveCfg({ maxRounds: Number(rndRange.value) })
})

var drag = null
function onDown(e) {
  if (e.button !== 0 && e.pointerType === 'mouse') return
  try { e.preventDefault() } catch (err) {}
  drag = { sx: e.clientX, sy: e.clientY, lx: root.offsetLeft, ty: root.offsetTop, moved: false }
  gear.classList.add('dsaq-drag')
  try { gear.setPointerCapture(e.pointerId) } catch (err) {}
}
function onMove(e) {
  if (!drag) return
  var dx = e.clientX - drag.sx
  var dy = e.clientY - drag.sy
  if (dx * dx + dy * dy >= 9) drag.moved = true
  if (drag.moved) {
    var vw = window.innerWidth || document.documentElement.clientWidth || 1280
    var vh = window.innerHeight || document.documentElement.clientHeight || 800
    root.style.left = Math.min(Math.max(0, drag.lx + dx), Math.max(0, vw - SZ)) + 'px'
    root.style.top = Math.min(Math.max(0, drag.ty + dy), Math.max(0, vh - SZ)) + 'px'
  }
}
function onUp() {
  if (!drag) return
  var wasMove = drag.moved
  drag = null
  gear.classList.remove('dsaq-drag')
  if (wasMove) {
    try { localStorage.setItem(POS_KEY, JSON.stringify([root.offsetLeft, root.offsetTop])) } catch (err) {}
  } else {
    togglePanel()
  }
}
gear.addEventListener('pointerdown', onDown)
gear.addEventListener('pointermove', onMove)
gear.addEventListener('pointerup', onUp)
gear.addEventListener('pointercancel', onUp)

document.addEventListener('pointerdown', function (e) {
  if (!panel.classList.contains('dsaq-open')) return
  if (root.contains(e.target)) return
  closePanel()
})

var pos = null
try { pos = JSON.parse(localStorage.getItem(POS_KEY) || 'null') } catch (err) {}
var vw0 = window.innerWidth || document.documentElement.clientWidth || 1280
var vh0 = window.innerHeight || document.documentElement.clientHeight || 800
var gx = pos && Array.isArray(pos) ? pos[0] : Math.max(0, vw0 - SZ - 18)
var gy = pos && Array.isArray(pos) ? pos[1] : Math.max(0, vh0 - SZ - 250)
root.style.left = Math.min(gx, Math.max(0, vw0 - SZ)) + 'px'
root.style.top = Math.min(gy, Math.max(0, vh0 - SZ)) + 'px'
})()`
