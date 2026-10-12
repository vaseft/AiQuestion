#!/usr/bin/env node
/**
 * AiQuestion 发布助手 / release helper
 *
 * 用法：
 *   node release.mjs --check    只做发布前自检（npm publish 会自动调用它）
 *   node release.mjs            自检 → 检查 npm 登录 → 发布到 npm 官方源
 *
 * 为什么需要它：
 *   1. 本机 ~/.npmrc 的 registry 指向 registry.npmmirror.com（只读镜像），
 *      发布必须显式走官方源 https://registry.npmjs.org/ ，本脚本已固定。
 *   2. 第一次发布的人通常卡在「没登录 / 不知道要登录」，脚本会把该做什么
 *      一步一步打印出来，而不是丢一个 ENEEDAUTH 错误给你。
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = import.meta.dirname
const REGISTRY = 'https://registry.npmjs.org/'
const PKG_NAME = 'dsh-plugin-aiquestion'
const checkOnly = process.argv.includes('--check')

const ok = s => `  \x1b[32m✔\x1b[0m ${s}`
const bad = s => `  \x1b[31m✘\x1b[0m ${s}`
const dim = s => `\x1b[2m${s}\x1b[0m`

function readJson(p) {
  return JSON.parse(readFileSync(join(ROOT, p), 'utf8'))
}

/** 发布前自检：任何一项不过都不允许 publish。 */
function preflight() {
  const problems = []
  const pkg = readJson('package.json')

  if (pkg.name !== PKG_NAME) problems.push(`package.json 的 name 是 ${pkg.name}，应为 ${PKG_NAME}`)
  if (!/^\d+\.\d+\.\d+/.test(String(pkg.version))) problems.push(`version 不是合法语义化版本：${pkg.version}`)
  if (pkg.private === true) problems.push('package.json 标了 "private": true，无法发布')

  // dsh 的加载契约：package.json 的 dsh.bundle.patch → cordis.patch.yml
  const patchRel = pkg.dsh?.bundle?.patch
  if (typeof patchRel !== 'string') problems.push('缺少 dsh.bundle.patch，DSH 无法识别为插件')
  else if (!existsSync(join(ROOT, patchRel))) problems.push(`dsh.bundle.patch 指向的 ${patchRel} 不存在`)

  // cordis.patch.yml 里的 entry name 必须与包名一致（否则市场判定「插件没有入口」）
  if (patchRel && existsSync(join(ROOT, patchRel))) {
    const patch = readFileSync(join(ROOT, patchRel), 'utf8')
    const names = [...patch.matchAll(/^\s*name:\s*['"]?([^'"\s#]+)['"]?\s*$/gm)].map(m => m[1])
    if (names.length === 0) problems.push(`${patchRel} 里没有找到 name: 行`)
    else if (!names.every(n => n === PKG_NAME || n.startsWith(`${PKG_NAME}/`)))
      problems.push(`${patchRel} 的 entry name (${names.join(', ')}) 与包名 ${PKG_NAME} 不一致`)
  }

  // 入口与随包文件
  const entry = typeof pkg.main === 'string' ? pkg.main : null
  if (entry === null) problems.push('缺少 main 入口')
  else if (!existsSync(join(ROOT, entry))) problems.push(`main 指向的 ${entry} 不存在`)

  for (const f of pkg.files ?? []) {
    if (!existsSync(join(ROOT, f))) problems.push(`files 里列了 ${f}，但文件不存在`)
  }

  // 单元测试
  try {
    execSync('node test/run.mjs', { cwd: ROOT, stdio: 'pipe' })
    console.log(ok('单元测试通过'))
  } catch (e) {
    problems.push('单元测试未通过：node test/run.mjs')
    const out = String(e.stdout ?? '') + String(e.stderr ?? '')
    if (out.trim() !== '') console.log(dim(out.split('\n').slice(-12).join('\n')))
  }

  if (problems.length === 0) {
    console.log(ok(`包自检通过：${PKG_NAME}@${pkg.version}`))
    return true
  }
  console.log(bad(`自检发现 ${problems.length} 个问题：`))
  for (const p of problems) console.log(`     · ${p}`)
  return false
}

/** 当前是否已登录 npm 官方源；返回用户名或 null。 */
function npmUser() {
  try {
    const out = execSync(`npm whoami --registry=${REGISTRY} --loglevel=error 2>&1`, {
      cwd: ROOT, encoding: 'utf8',
    })
    const line = out.split('\n').map(s => s.trim()).filter(s => s !== '' && !s.startsWith('npm warn')).pop()
    return line ?? null
  } catch {
    return null
  }
}

function howToLogin() {
  console.log(`
\x1b[33m还没有登录 npm，所以不能发布。\x1b[0m 三步，大约两分钟：

  1) 注册账号（已有可跳过）
     浏览器打开 →  https://www.npmjs.com/signup

  2) 在本终端登录（在项目目录下执行）
     npm login --registry=${REGISTRY}
     依次输入：用户名 / 密码 / 邮箱 / 邮箱收到的验证码
     ${dim('提示：输入密码时屏幕不显示任何字符，这是正常的，打完回车即可。')}

  3) 再跑一次本脚本
     npm run release

${dim('说明：本机 ~/.npmrc 的 registry 指向 registry.npmmirror.com（只读镜像，不能发布），')}
${dim('      本脚本已固定使用官方源，你不需要改任何配置。')}
`)
}

console.log(`\n\x1b[1mAiQuestion · 发布助手\x1b[0m  ${dim(REGISTRY)}\n`)

if (!preflight()) {
  console.log(bad('自检未通过，已终止发布。'))
  process.exit(1)
}
if (checkOnly) process.exit(0)

const user = npmUser()
if (user === null) {
  howToLogin()
  process.exit(1)
}

console.log(ok(`已登录为 ${user}，开始发布…\n`))
try {
  execSync(`npm publish --registry=${REGISTRY} --access public`, { cwd: ROOT, stdio: 'inherit' })
} catch {
  console.log(bad('发布失败，请把上面的报错贴给我。'))
  process.exit(1)
}
console.log(`
${ok(`发布成功：${PKG_NAME}`)}
${dim('https://www.npmjs.com/package/' + PKG_NAME)}

现在任何人（包括你）都可以在 DSH 的插件安装里直接填入：
    ${PKG_NAME}
`)
