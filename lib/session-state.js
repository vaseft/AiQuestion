// ============================================================================
// AiQuestion —— 会话澄清状态机
// ----------------------------------------------------------------------------
// 每个会话维护一份澄清状态：是否正在等待用户回答、已追问几轮、原始请求、
// 以及最终确定的“意图契约”。纯内存态：进程重启即重置（fail-open，不会
// 因为丢状态而卡住任何对话）。
// ============================================================================
const STATES = new Map() // sessionId -> state
const TTL_MS = 6 * 60 * 60 * 1000 // 6 小时无活动后回收

function now() {
  return Date.now()
}

function prune() {
  const t = now()
  for (const [k, v] of STATES) {
    if (t - (v.touchedAt || 0) > TTL_MS) STATES.delete(k)
  }
}

export function getState(sessionId) {
  if (!sessionId) return null
  const s = STATES.get(sessionId)
  if (!s) return null
  s.touchedAt = now()
  return s
}

export function ensureState(sessionId) {
  if (!sessionId) return null
  let s = STATES.get(sessionId)
  if (!s) {
    s = {
      pending: false, // 是否已向用户提问、正等待回答
      round: 0, // 已追问轮数
      request: '', // 触发澄清的原始请求
      questions: [], // 上一轮提出的问题
      lastDecision: '', // AI 的默认决断
      contract: '', // 已确定的意图契约
      resolved: false, // 意图是否已充分
      touchedAt: now(),
    }
    STATES.set(sessionId, s)
  }
  s.touchedAt = now()
  if (STATES.size > 200) prune()
  return s
}

export function clearState(sessionId) {
  if (sessionId) STATES.delete(sessionId)
}

/** 供测试使用：重置全部状态。 */
export function _reset() {
  STATES.clear()
}
