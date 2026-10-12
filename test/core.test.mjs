// AiQuestion —— 核心逻辑自测（node:test，无外部依赖）
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { normalizeConfig, DEFAULT_CONFIG } from '../lib/config.js'
import { ensureState, getState, clearState, _reset } from '../lib/session-state.js'
import { renderAskText, renderContractText } from '../lib/intent.js'
import { parseJson } from '../lib/mini.js'
import { loadLines } from '../lib/talking.js'
import * as plugin from '../lib/index.js'
import { WIDGET_JS } from '../lib/widget.js'

test('normalizeConfig：非法值回落到默认', () => {
  const c = normalizeConfig(null)
  assert.equal(c.enabled, true)
  assert.equal(c.mode, 'auto')
  assert.equal(c.workloadThreshold, DEFAULT_CONFIG.workloadThreshold)
  assert.equal(c.maxRounds, DEFAULT_CONFIG.maxRounds)

  const bad = normalizeConfig({
    enabled: 'nope',
    mode: 'bogus',
    workloadThreshold: 99,
    maxRounds: -3,
    talking: 'nope',
  })
  assert.equal(bad.enabled, true) // 只有严格 false 才关闭
  assert.equal(bad.mode, 'auto')
  assert.equal(bad.workloadThreshold, DEFAULT_CONFIG.workloadThreshold)
  assert.equal(bad.maxRounds, DEFAULT_CONFIG.maxRounds)
  assert.equal(bad.talking, 'engineer')
})

test('normalizeConfig：合法值被保留', () => {
  const c = normalizeConfig({
    enabled: false,
    mode: 'always',
    workloadThreshold: 3,
    maxRounds: 4,
    talking: 'sassy',
    publishIntentTool: true,
  })
  assert.equal(c.enabled, false)
  assert.equal(c.mode, 'always')
  assert.equal(c.workloadThreshold, 3)
  assert.equal(c.maxRounds, 4)
  assert.equal(c.talking, 'sassy')
  assert.equal(c.publishIntentTool, true)
})

test('session-state：确保/读取/清除', () => {
  _reset()
  assert.equal(getState('s1'), null)
  const s = ensureState('s1')
  assert.equal(s.pending, false)
  assert.equal(s.resolved, false)
  s.pending = true
  assert.equal(getState('s1').pending, true)
  clearState('s1')
  assert.equal(getState('s1'), null)
})

test('renderAskText：包含问题与默认决断', () => {
  const text = renderAskText({
    line: '先把需求讲清楚。',
    workload: 8,
    questions: ['用 A 还是 B？我倾向 B。'],
    myDecision: '默认按 B 实现。',
    round: 1,
    maxRounds: 2,
  })
  assert.match(text, /AiQuestion/)
  assert.match(text, /8\/10/)
  assert.match(text, /A 还是 B/)
  assert.match(text, /默认按 B/)
})

test('renderContractText：包含契约正文', () => {
  const t = renderContractText('目标：X\n验收：Y')
  assert.match(t, /意图契约/)
  assert.match(t, /验收：Y/)
})

test('parseJson：剥离代码围栏与前后缀', () => {
  assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 })
  assert.deepEqual(parseJson('前缀 {"a":2} 后缀'), { a: 2 })
  assert.equal(parseJson('not json'), null)
  assert.equal(parseJson(''), null)
})

test('talking：三个话术库至少各一条', () => {
  for (const id of ['engineer', 'sassy', 'mentor']) {
    const lines = loadLines(id)
    assert.ok(lines.length >= 5, `${id} 话术条数不足`)
  }
})

test('插件导出：name/inject/apply 齐备且 widget 非空', () => {
  assert.equal(plugin.name, 'dsh-aiquestion')
  assert.ok(Array.isArray(plugin.inject))
  assert.ok(plugin.inject.includes('webServer'))
  assert.equal(typeof plugin.apply, 'function')
  assert.ok(WIDGET_JS.length > 1000)
  assert.match(WIDGET_JS, /__dshAiQuestion/)
  assert.match(WIDGET_JS, /dsh-aiquestion\/config.json/)
})
