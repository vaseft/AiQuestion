// ============================================================================
// AiQuestion「先问清楚再动手」 — dsh-plugin-aiquestion
// ----------------------------------------------------------------------------
// 机制（程序化澄清，主模型在澄清阶段零 token）：
//
//   每轮用户指令的流程（在 agent/pre-step waterfall 中实现，位于模型请求之前）：
//     用户发出指令
//       → 插件停用 / mode=never？ → 直接放行（零消耗）
//       → 正在等待澄清回答？
//            → 旁路请求裁决“用户回答是否合理、是否有参考意义”（AI 判断优先）
//                → 意图已充分 OR 已达追问上限 → 写入“意图契约”，放行主模型
//                → 否则 → 写入 AI 的追问（含 AI 默认决断），拒绝本轮（主模型零调用）
//       → 新一轮请求 → 旁路请求评估“意图是否充分 + 预估工作量”
//            → 意图清晰且工作量低于阈值 → 直接放行（零干预、零额外消耗）
//            → 否则 → 生成 1-4 个澄清问题，写入会话并拒绝本轮（主模型零调用）
//
//   “以 AI 为优先级”：裁决旁路请求被明确要求——用户回答若技术错误、自相矛盾、
//   或只是“随便/你看着办”式敷衍，一律判为无参考意义、不采纳，由 AI 按自身最优解
//   推进，直到 AI 彻底理解用户意图为止。
//
//   “真正省 token”（对齐 dsh-ops 的理念）：所有评估与裁决都走极小、无历史的旁路
//   请求；澄清期间主模型 0 调用；一次问清换来的是避免主模型在误解下生成大量内容后
//   的返工——省下的远多于旁路成本；意图清晰的小请求直接放行，完全不打扰。
//
//   ⚠ 三条硬约束（沿袭 DSH 会话事件契约，违反会永久损坏该会话历史）：
//   1) assistant/message 必须带数值 turn/step 并被 step/start 包裹，且 message
//      必须是完整 AssistantMessage（content 数组不可缺）；
//   2) 事件 data 必须带 `stream` 数组（AiQuestion 无模型流，写空数组 []）；
//   3) 拒绝统一返回官方的 { kind: 'reject' }，不要用 { kind:'enter', messages:[] }
//      之类技巧代替。
//   写入前做完整形状校验，任一不满足即 fail-open 放行——宁可不澄清，也绝不写坏事件。
//
//   设置界面：可拖动小齿轮 + 面板，配置持久化到 $DSH_HOME/dsh-plugin-aiquestion/config.json。
// ============================================================================
import { randomUUID } from 'node:crypto'
import {
  readConfig,
  writeConfig,
  normalizeConfig,
  TALKING_LIBS,
  TALKING_NAMES,
  MODES,
} from './config.js'
import { ensureState } from './session-state.js'
import { seedTalking, pickLine, loadLines } from './talking.js'
import { triageIntent, judgeAnswer, renderAskText, renderContractText } from './intent.js'
import { WIDGET_JS } from './widget.js'

// 最近一次裁决结果（内存态，供设置面板展示）
let lastStatus = null

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
}

function messageText(m) {
  return (Array.isArray(m && m.content) ? m.content : [])
    .filter((b) => b && b.type === 'text')
    .map((b) => b.text)
    .join('\n')
}

function sessionIdOf(agent) {
  const h = agent && agent.session && agent.session.header
  let id = h && (h.id || h.sessionId || h.key)
  if (!id && agent && agent.session && typeof agent.session.id === 'string') id = agent.session.id
  if (!id && agent) {
    if (!agent.__aqSid) {
      try {
        agent.__aqSid = 'agent-' + randomUUID()
      } catch {
        agent.__aqSid = 'agent-unknown'
      }
    }
    id = agent.__aqSid
  }
  return id || 'default'
}

// —— 会话事件契约校验（沿袭 AIQuit 的教训）——
function isContractMessage(m) {
  return !!m && typeof m === 'object' && typeof m.id === 'string' && Array.isArray(m.content)
}

function isContractAssistantEvent(data) {
  return (
    Number.isSafeInteger(data.turn) &&
    data.turn >= 0 &&
    Number.isSafeInteger(data.step) &&
    data.step >= 0 &&
    Array.isArray(data.stream) &&
    !!data.message &&
    typeof data.message === 'object' &&
    Array.isArray(data.message.content)
  )
}

/**
 * 向会话写入一轮“AI 发问”的完整事件流（不调用主模型），随后由调用方拒绝本轮。
 * 返回 true 表示写入成功；false 表示形状不合法或写入失败（调用方应 fail-open 放行）。
 */
function writeAskTurn(agent, userMessages, text, turn, step) {
  if (!Number.isSafeInteger(turn) || turn < 0 || !Number.isSafeInteger(step) || step < 0) return false
  if (!Array.isArray(userMessages) || !userMessages.every(isContractMessage)) return false
  const session = agent && agent.session
  if (!session || typeof session.append !== 'function') return false
  const body = typeof text === 'string' && text.trim() ? text : '（AiQuestion 未能生成澄清内容）'
  const eventData = {
    turn,
    step,
    message: {
      id: 'aiquestion-' + randomUUID(),
      role: 'assistant',
      content: [{ type: 'text', text: body }],
      source: {
        kind: 'model',
        provider: (agent.options && agent.options.provider) || 'deepseek',
        model: (agent.options && agent.options.model) || 'dsh-plugin-aiquestion',
      },
    },
    stream: [],
  }
  if (!isContractAssistantEvent(eventData)) return false
  try {
    session.append('step/start', { turn, step })
    for (const m of userMessages) {
      session.append('user/message', m, { surfaceOp: 'append' })
    }
    session.append('assistant/message', eventData, { surfaceOp: 'append' })
    session.append('step/end', { turn, step })
    return true
  } catch (err) {
    try {
      console.error('[dsh-plugin-aiquestion] writeAskTurn append failed:', err)
    } catch {
      /* ignore */
    }
    return false
  }
}

// —— 把“意图契约”注入本轮模型输入（best-effort，去重）——
function injectContract(payload, contract) {
  try {
    const msgs = payload && payload.messages
    if (!Array.isArray(msgs)) return
    const id = 'aiquestion-contract'
    if (msgs.some((m) => m && m.id === id)) return
    msgs.push({
      id,
      role: 'user',
      content: [{ type: 'text', text: renderContractText(contract) }],
      source: { kind: 'plugin', plugin: 'dsh-plugin-aiquestion' },
    })
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// 插件主体
// ---------------------------------------------------------------------------
const name = 'dsh-plugin-aiquestion'
const inject = ['webServer', 'credentials']

function apply(ctx) {
  seedTalking()

  const disposers = []

  disposers.push(
    ctx.on('agent/pre-step', async (payload, next) => {
      try {
        const cfg = readConfig()
        if (!cfg.enabled || cfg.mode === 'never') return next()

        const agent = payload && payload.agent
        const messages = payload && Array.isArray(payload.messages) ? payload.messages : []
        if (messages.length === 0) return next()

        // 只处理真实用户输入；系统/插件/goal/子代理注入一律放行
        const userMsgs = messages.filter((m) => m && m.source && m.source.kind === 'user')
        if (userMsgs.length === 0) return next()

        // 只拦截根 agent（不拦截子代理 spawn/fork）
        const header = agent && agent.session && agent.session.header
        if (header && header.parentSession !== undefined) return next()

        const text = userMsgs.map(messageText).join('\n').trim()
        if (!text) return next()

        const turn = payload.turn
        const step = payload.step
        const state = ensureState(sessionIdOf(agent))
        if (!state) return next()

        // 已确定意图：不再干预
        if (state.resolved) return next()

        // —— 情形 A：正在等待用户对澄清问题的回答 ——
        if (state.pending) {
          const judged = await judgeAnswer(ctx, cfg, {
            request: state.request,
            questions: state.questions,
            answer: text,
            round: state.round,
            maxRounds: cfg.maxRounds,
          })

          if (!judged) {
            // 裁决失败：fail-open 放行，避免卡死对话
            state.pending = false
            return next()
          }

          if (judged.myDecision) state.lastDecision = judged.myDecision

          const reachedLimit = state.round >= cfg.maxRounds
          if (judged.clear || reachedLimit) {
            state.resolved = true
            state.pending = false
            state.contract = judged.contract || state.contract || ''
            lastStatus = {
              action: 'contract',
              round: state.round,
              verdict: judged.verdict,
              at: Date.now(),
            }
            // 把契约注入本轮模型输入，让主模型立刻按契约开工
            if (state.contract) injectContract(payload, state.contract)
            return next()
          }

          // 回答仍不合理/无参考意义：AI 以自身判断为准，继续追问
          state.round += 1
          if (judged.nextQuestions.length) state.questions = judged.nextQuestions
          const line = pickLine(cfg.talking)
          const askText = renderAskText({
            line,
            workload: null,
            questions: state.questions,
            myDecision: state.lastDecision,
            round: state.round,
            maxRounds: cfg.maxRounds,
          })
          lastStatus = { action: 'ask', round: state.round, verdict: judged.verdict, at: Date.now() }
          if (!writeAskTurn(agent, userMsgs, askText, turn, step)) return next()
          return { kind: 'reject' }
        }

        // —— 情形 B：新一轮用户请求 → 评估意图充分性 ——
        const tri = await triageIntent(ctx, cfg, text)
        if (!tri) return next() // 评估失败：fail-open

        const needClarify =
          cfg.mode === 'always' ||
          tri.ambiguous ||
          (typeof tri.workload === 'number' && tri.workload >= cfg.workloadThreshold)

        if (!needClarify || tri.questions.length === 0) {
          lastStatus = {
            action: 'pass',
            workload: tri.workload,
            at: Date.now(),
          }
          return next() // 意图清晰：零干预放行
        }

        state.pending = true
        state.round = 1
        state.request = text
        state.questions = tri.questions
        state.lastDecision = tri.myDecision

        const line = pickLine(cfg.talking)
        const askText = renderAskText({
          line,
          workload: tri.workload,
          questions: tri.questions,
          myDecision: tri.myDecision,
          round: 1,
          maxRounds: cfg.maxRounds,
        })
        lastStatus = { action: 'ask', workload: tri.workload, round: 1, at: Date.now() }

        if (!writeAskTurn(agent, userMsgs, askText, turn, step)) return next()
        return { kind: 'reject' }
      } catch (err) {
        try {
          console.error('[dsh-plugin-aiquestion] pre-step error:', err)
        } catch {
          /* ignore */
        }
        return next() // 任何异常放行，绝不阻塞对话
      }
    }),
  )

  // —— 可选的提示词注入：仅在用户显式开启时注册（零开销基线）——
  try {
    if (readConfig().publishIntentTool) {
      ctx.inject(['systemPrompt'], (c) => {
        c.effect(
          () =>
            c.systemPrompt.section({
              name: 'dsh-plugin-aiquestion:contract-hint',
              order: 3300,
              interpolate: false,
              text: () =>
                '# Intent contract (AiQuestion)\n' +
                'This session was clarified by the AiQuestion plugin. ' +
                'Any "【AiQuestion · 意图契约】" block in the conversation is authoritative: ' +
                'execute it as-is and do not re-ask what it already decided.',
            }),
          'dsh-plugin-aiquestion: contract hint',
        )
      })
    }
  } catch {
    /* 提示词注入失败不影响核心功能 */
  }

  // —— Web 配置接口 ——
  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []
      let size = 0
      req.on('data', (c) => {
        size += c.length
        if (size > 8192) {
          reject(new Error('body too large'))
          req.destroy()
          return
        }
        chunks.push(c)
      })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })
  }

  function configPayload() {
    const cfg = readConfig()
    const libraries = {}
    for (const id of Object.keys(TALKING_LIBS)) {
      libraries[id] = { count: loadLines(id).length, name: TALKING_NAMES[id] }
    }
    return {
      ok: true,
      enabled: cfg.enabled,
      mode: cfg.mode,
      modes: MODES,
      workloadThreshold: cfg.workloadThreshold,
      maxRounds: cfg.maxRounds,
      talking: cfg.talking,
      publishIntentTool: cfg.publishIntentTool,
      libraries,
      preview: pickLine(cfg.talking),
      lastStatus: lastStatus
        ? { action: lastStatus.action, workload: lastStatus.workload ?? null, round: lastStatus.round ?? null, verdict: lastStatus.verdict || '', at: lastStatus.at }
        : null,
    }
  }

  disposers.push(
    ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-plugin-aiquestion/widget.js',
      handler: (req, res) => {
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-store',
        })
        res.end(WIDGET_JS)
      },
    }),
  )

  disposers.push(
    ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-plugin-aiquestion/config.json',
      handler: async (req, res) => {
        try {
          if (req.method === 'PUT' || req.method === 'POST') {
            const body = await readBody(req)
            const parsed = JSON.parse(body)
            const cur = readConfig()
            const next = normalizeConfig({
              ...cur,
              enabled: parsed.enabled !== undefined ? parsed.enabled : cur.enabled,
              mode: parsed.mode !== undefined ? parsed.mode : cur.mode,
              workloadThreshold:
                parsed.workloadThreshold !== undefined ? parsed.workloadThreshold : cur.workloadThreshold,
              maxRounds: parsed.maxRounds !== undefined ? parsed.maxRounds : cur.maxRounds,
              talking: parsed.talking !== undefined ? parsed.talking : cur.talking,
              publishIntentTool:
                parsed.publishIntentTool !== undefined ? parsed.publishIntentTool : cur.publishIntentTool,
            })
            if (!writeConfig(next)) {
              res.writeHead(500, JSON_HEADERS)
              res.end(JSON.stringify({ ok: false, error: '无法持久化配置' }))
              return
            }
            res.writeHead(200, JSON_HEADERS)
            res.end(JSON.stringify(configPayload()))
            return
          }
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify(configPayload()))
        } catch (err) {
          res.writeHead(400, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err) }))
        }
      },
    }),
  )

  disposers.push(
    ctx.webServer.tapIndex((html) => {
      if (html.indexOf('/dsh-plugin-aiquestion/widget.js') !== -1) return html
      const tag = '<script defer src="/dsh-plugin-aiquestion/widget.js"></script>'
      if (html.indexOf('</body>') !== -1) return html.replace('</body>', tag + '</body>')
      return html + tag
    }),
  )

  ctx.effect(() => () => {
    for (const d of disposers) {
      try {
        d()
      } catch {
        /* ignore */
      }
    }
  })
}

export { name, inject, apply }
