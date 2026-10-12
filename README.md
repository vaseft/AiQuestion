# AiQuestion「先问清楚再动手」

**中文** | [English](README.en.md)

> 一个 DSH（DeepSeek Harness）插件：在你把一句含糊的话丢给 AI 之后，它**不会立刻开干**，
> 而是先向你提问、逼你说清楚——**并且以 AI 自己的判断为优先**，判断你的回答是否合理、
> 是否有参考意义。直到 AI 彻底理解你到底要干什么，它才动手。

用来治两种病（笑）：

- **vibe code** —— “我也说不清，你先写，我看着改。”
- **wish code** —— “给我一个超厉害的 app，什么都能干。”

这两种需求的共同结局是：AI 愉快地烧掉几万 token，交付了一个你并不想要的东西，然后你重来一遍。
AiQuestion 的立场很明确：**在误解上花的每一个 token，都是浪费。**

---

## 核心机制

每一轮用户输入，都会在模型请求**之前**被 `agent/pre-step` 拦截并走一遍下面的流程：

```
用户发出指令
  ├─ 插件停用 / mode=never？ ──────────── 直接放行（零消耗）
  ├─ 正在等待你对上一轮提问的回答？
  │     ├─ 旁路请求裁决：你的回答是否“合理且有参考意义”（AI 判断优先）
  │     │     ├─ 意图已充分 OR 已达追问上限 → 生成【意图契约】并放行主模型
  │     │     └─ 否则 → 写入 AI 的追问（含 AI 的默认决断），拒绝本轮（主模型零调用）
  └─ 新一轮请求 → 旁路请求评估：意图是否充分 + 预估工作量
        ├─ 意图清晰且工作量低于阈值 → 直接放行（零干预）
        └─ 否则 → 生成 1-4 个澄清问题，写入会话并拒绝本轮（主模型零调用）
```

关键点：**澄清阶段主模型一次都不调用**。所有评估与裁决都由一个极小、**不带历史**的旁路请求完成，
结果返回给程序判定。主模型只在意图真正清楚后才第一次获得执行权。

### AI 优先：不迁就用户的随口回答

裁决提示词对 AI 有明确授权：**AI 的判断优先级高于用户的随口回答**。

- 你的回答若有**技术错误 / 自相矛盾 / 明显不可行** → 判为“不合理”，**不采纳**；
- 你的回答若只是复述原话，或用 **“随便 / 你看着办 / 都行 / 你决定”敷衍** → 判为“**无参考意义**”，**不采纳**；
- AI 会按**自己认为的最优解**继续推进，并把“我替你做的决定”写进**意图契约**；
- 追问有**轮数上限**（默认 2 轮）。到顶之后，AI **自行决断并开工**，不会没完没了地问。

换句话说：它问，是为了搞懂你；但它不听你的，除非你说的对。

### 意图契约

当 AI 判定意图已足够清楚，它会产出并写入一条 **【意图契约】**：目标 / 范围边界 /
关键决策（含 AI 替你做的决定）/ 验收标准。该契约会被注入本轮的模型输入，并被要求**原样执行**，
避免主模型再重复问一遍已经决定过的事。

---

## 真正省 token（对齐 [dsh-ops](https://github.com/T-Auto/dsh-ops) 的理念）

AiQuestion 的省 token 不是“少说话”，而是**不在误解上烧钱**：

| 手段 | 效果 |
| --- | --- |
| 评估/裁决全部走**无历史的旁路请求** | 澄清阶段主模型 **0 调用**；旁路请求只有几十~几百 token |
| **一次问清**，换来的是不返工 | 省下的是主模型在错误方向上的整段生成，远大于旁路成本 |
| 意图清晰的小请求**直接放行** | 闲聊、小改动**零干预、零额外开销** |
| `workloadThreshold` 阈值门控 | 只有预估工作量达到阈值（默认 6/10）才触发澄清 |
| **默认不发布任何工具、不注入任何提示词** | 插件对主模型的固定 token 成本为 **0** |
| 插件停用 / `mode=never` | 完全旁路，**零消耗** |

---

## 安装

AiQuestion 是一个标准 DSH 插件（`package.json` 的 `dsh.bundle.patch` + `cordis.patch.yml`）。

**本地开发 / link 安装：**

```sh
dsh plugin --profile web add link:E:/dsh/dsh/AiQuestion
# 或发布到 npm 后：
dsh plugin --profile web add dsh-aiquestion
```

桌面端（NewMax / DeepSeek Harness Desktop）请使用应用自带的 CLI 入口，例如：

```sh
"<桌面安装目录>/resources/runtime/cli/bin/dsh.cmd" plugin --profile desktop add link:E:/dsh/dsh/AiQuestion
```

安装后**重启**对应的 `dsh` 进程（插件随 profile 启动加载）。

> 旁路请求需要一个 OpenAI 兼容端点。默认使用 `https://api.deepseek.com` + `deepseek-chat`，
> API key 从 DSH 凭据服务的 `DEEPSEEK_API_KEY`（或同名环境变量）读取；也可在配置里改 `provider`。
> 若宿主暴露了可用的 LLM 服务，插件会优先复用它。

---

## 使用

1. 网页右下角有一个**可自由拖动的小齿轮**，点击打开设置面板。
2. 给 AI 一句含糊的话（例如“帮我做个有意思的小工具”），看它先把问题甩回给你。
3. 回答它；如果你敷衍，它会**照样追问**或**自己拍板**。

### 设置面板

| 项 | 说明 |
| --- | --- |
| **启用 AiQuestion** | 总开关。关闭后不评估、不拦截，**零 token 消耗**。 |
| **触发模式** | `智能`（默认，仅意图含糊或工作量大时澄清）/ `总是`（每轮先澄清）/ `关闭`。 |
| **工作量阈值** | 1-10，预估工作量 ≥ 该值才触发澄清。调低更啰嗦，调高更省 token。 |
| **最多追问轮数** | 0-5，超过则 AI 自行决断并开工。 |
| **提问风格** | `冷静工程师` / `毒舌评审` / `耐心导师`，点击即切换。 |
| 状态预览 | 显示**最近一次**动作（放行 / 提问 / 生成契约）与裁决结论。 |

所有设置即时保存，无需重启（配置文件：`$DSH_HOME/dsh-aiquestion/config.json`）。

---

## 自定义提问话术

话术库位于插件的 `talking/` 文件夹：

- `talking/engineer.txt` —— 冷静工程师（一行一条）
- `talking/sassy.txt` —— 毒舌评审
- `talking/mentor.txt` —— 耐心导师

插件首次启动时会把这些文件**自动复制到 `$DSH_HOME/talking/`**（如 `C:\Users\<你>\.dsh\talking\`）。
之后插件**优先读取该目录下的版本**——直接编辑即可自定义，无需碰 `node_modules`，改完立刻生效。

---

## ⚠️ 会话事件契约（重要）

AiQuestion 与 [AIQuit](https://github.com/Jia-HuaWu/AIQuit) 一样，会在拒绝本轮时向会话写入
一条 **assistant/message**（AI 的提问）。该事件必须逐字节满足 DSH 的会话事件契约：

1. `assistant/message` 必须携带数值 `turn` / `step`、被 `step/start` 包裹，且 `message.content` 为数组；
2. 事件 `data` 必须带 `stream` 数组（无模型流时写 `[]`）；
3. 拒绝统一返回官方的 `{ kind: 'reject' }`。

写入前本插件会做**完整形状校验**，任一不满足即 **fail-open 放行**——**宁可不澄清，也绝不写坏事件**。
这些约束来自 AIQuit 作者记录的惨痛教训，特此致谢（见 [NOTICE](NOTICE)）。

---

## 开发与测试

```sh
node test/run.mjs        # 或 npm test
```

覆盖配置规范化、会话状态机、提示词渲染、JSON 解析与插件导出形状。

---

## 目录结构

```
AiQuestion/
├── lib/
│   ├── index.js         # 插件主体：agent/pre-step 拦截 + 会话状态机 + Web 配置接口
│   ├── intent.js        # 意图裁决核心：triageIntent / judgeAnswer
│   ├── prompts.js       # 旁路请求系统提示词（AI 优先裁决）
│   ├── mini.js          # 极小旁路模型调用 + JSON 解析
│   ├── config.js        # 配置读写与规范化
│   ├── session-state.js # 每会话澄清状态机
│   ├── talking.js       # 话术库加载
│   └── widget.js        # 可拖动齿轮 + 设置面板（前端脚本）
├── talking/             # 提问话术（engineer / sassy / mentor）
├── test/                # node:test 自测
├── cordis.patch.yml     # DSH bundle patch（挂载声明）
├── dsh-plugin.json      # DSH 插件清单
└── package.json
```

---

## 致谢与署名

本项目是**原创实现**，在设计上参考了以下两个开源的 DSH 插件，作者与出处如下：

- **[AIQuit「爷不干了」](https://github.com/Jia-HuaWu/AIQuit)** — 作者 [**Jia-HuaWu**](https://github.com/Jia-HuaWu)（MIT）。
  借鉴其**程序化裁决**模式：在 `agent/pre-step` 拦截每轮输入、用极小无历史的旁路请求做决策、
  以完全符合契约的事件流拒绝本轮而主模型零调用；其记录的**会话事件契约**教训与
  可拖动齿轮设置面板的可交互形态也直接启发了本项目。
  *AIQuit 是本项目的反面镜像：它拒绝干活，AiQuestion 则在干活前先问清楚。*

- **[dsh-ops](https://github.com/T-Auto/dsh-ops)** — 作者 [**T-Auto**](https://github.com/T-Auto)（MIT AND Apache-2.0）。
  借鉴其**节约 token 的工程哲学**与 DSH 插件打包形态：组件开关、**零固定成本的提示词基线**、
  大量使用廉价的旁路请求，以及“真正省 token（避免返工，而非单纯缩短输出）”的原则。

详见 [NOTICE](NOTICE)。本项目未逐字拷贝上述项目的源码；如二次分发，请保留 NOTICE 以维持对原作者的署名。

## License

[MIT](LICENSE) © 2026 vaseft (AiQuestion contributors)
