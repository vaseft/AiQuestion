// ============================================================================
// AiQuestion —— 意图裁决核心
// ----------------------------------------------------------------------------
//   triageIntent：判断请求是否需要澄清，并按需生成澄清问题 + AI 默认决断
//   judgeAnswer ：裁决用户回答是否合理（AI 判断优先），产出“意图契约”
// 两处都用一次极小、无历史的旁路请求完成，主模型在澄清阶段零 token。
// ============================================================================
import { callMini, parseJson } from './mini.js'
import { TRIAGE_SYSTEM, JUDGE_SYSTEM } from './prompts.js'

function asQuestions(v) {
  if (!Array.isArray(v)) return []
  return v
    .filter((q) => typeof q === 'string' && q.trim())
    .map((q) => q.trim())
    .slice(0, 4)
}

function clampWorkload(v) {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return null
  return Math.min(10, Math.max(1, n))
}

/**
 * 评估意图充分性。
 * @returns {Promise<null | {workload:number|null, ambiguous:boolean, questions:string[], myDecision:string}>}
 */
export async function triageIntent(ctx, cfg, text) {
  const input =
    '【用户请求】\n' + String(text || '').slice(0, 6000) +
    '\n\n请按系统指令输出 JSON。'
  const out = await callMini(ctx, cfg, TRIAGE_SYSTEM, input, cfg.triageMaxTokens)
  const j = parseJson(out)
  if (!j || typeof j !== 'object') return null
  return {
    workload: clampWorkload(j.workload),
    ambiguous: j.ambiguous === true,
    questions: asQuestions(j.questions),
    myDecision: typeof j.myDecision === 'string' ? j.myDecision.trim() : '',
  }
}

/**
 * 裁决用户回答（AI 判断优先）。
 * @returns {Promise<null | {clear:boolean, verdict:string, contract:string, nextQuestions:string[], myDecision:string}>}
 */
export async function judgeAnswer(ctx, cfg, { request, questions, answer, round, maxRounds }) {
  const q = Array.isArray(questions) && questions.length
    ? questions.map((s, i) => `${i + 1}. ${s}`).join('\n')
    : '（无）'
  const input =
    '【原始请求】\n' + String(request || '').slice(0, 4000) +
    '\n\n【你上一轮提出的澄清问题】\n' + q +
    '\n\n【用户这次的回答】\n' + String(answer || '').slice(0, 4000) +
    `\n\n【已进行轮数】${round} / 上限 ${maxRounds}` +
    '\n\n请按系统指令输出 JSON。'
  const out = await callMini(ctx, cfg, JUDGE_SYSTEM, input, cfg.judgeMaxTokens)
  const j = parseJson(out)
  if (!j || typeof j !== 'object') return null
  return {
    clear: j.clear === true,
    verdict: typeof j.verdict === 'string' ? j.verdict.trim() : '',
    contract: typeof j.contract === 'string' ? j.contract.trim() : '',
    nextQuestions: asQuestions(j.nextQuestions),
    myDecision: typeof j.myDecision === 'string' ? j.myDecision.trim() : '',
  }
}

/** 组装“AI 提问”消息正文。 */
export function renderAskText({ line, workload, questions, myDecision, round, maxRounds }) {
  const parts = ['【AiQuestion · 先问清楚再动手】', line]
  const scale = workload ? `预估工作量 ${workload}/10` : '这个需求的信息量还不够'
  parts.push(`在我动手之前（${scale}，第 ${round}/${maxRounds} 轮澄清），先确认几件事，以免把 token 烧在返工上：`)
  questions.forEach((q, i) => parts.push(`${i + 1}. ${q}`))
  if (myDecision) parts.push(`\n我的默认决断：${myDecision}`)
  parts.push('（直接回答即可；若你说“按你说的来”，我就按上面的默认决断开工。）')
  return parts.join('\n')
}

/** 组装“意图契约”消息正文。 */
export function renderContractText(contract) {
  return [
    '【AiQuestion · 意图契约】',
    '意图已确认，下面是我据此执行的契约（含我替你做掉的决定）：',
    '',
    contract || '（按我上一条的默认决断执行）',
  ].join('\n')
}
