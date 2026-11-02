---
name: bizatlas
description: 读一个业务系统的源码，生成或更新 BizAtlas 业务地图数据（.bizatlas/ 下的 map.json、functions.json、tables.json、process.json），让人能在 BizAtlas 查看器里按业务对象看懂这个项目。用户说「给这个项目画业务地图」「生成业务地图数据」「整理业务对象和关系」「更新地图」「把功能 / 表字段 / 流程图补进地图」时使用。只读源码，不连数据库、不改业务代码。
---

# BizAtlas：从源码整理业务地图

目标：产出一个 `.bizatlas/` 目录，BizAtlas 查看器加载后能回答三件事——**系统里有哪些业务对象、各自负责什么、它们怎么关联**；再往下能看每个对象的功能、表字段和操作先后。

## BizAtlas 仓库在哪

下文的 `<BizAtlas>` 指 BizAtlas 仓库的本地目录，校验和启动查看器的命令都要在这个目录下运行。按顺序找：

1. 用户说过的位置。
2. 本 skill 目录下 `home.txt` 里写的路径（安装时写入）。
3. 用户主目录下的 `BizAtlas`（Windows 为 `%USERPROFILE%\BizAtlas`）。
4. 都没有：按仓库的 [INSTALL.md](https://github.com/yixide/BizAtlas/blob/main/INSTALL.md) 安装，再继续。

BizAtlas 是所有项目共用的一份本机工具，不要装进业务项目里；多个项目的地图都登记到它的 `.local/projects.json`，在同一个查看器里切换（见「收尾」）。

数据协议以 BizAtlas 仓库里的两份文件为准，动手前先读：

- `docs/data-format.md`：每个文件、每个字段的含义和例子
- `schema/map.schema.json`：`map.json` 的 JSON Schema

`examples/library/.bizatlas/` 是一套完整的虚构样例，拿不准格式时照着它写。

## 铁律

1. **只读源码**。不改业务代码，不连数据库、不调接口、不联网。唯一写入的是 `.bizatlas/` 目录和生成脚本。
2. **证据必须真实**。`confidence: "confirmed"` 必须带至少一条 `{file, line}` 证据，行号指向真能支撑这条信息的那一行（建表语句、实体类、外键字段、控制器方法）。找不到证据就标 `inferred`，证据可以为空数组。多仓库时在 `map.json` 的 `project.repos` 里列出各仓库，非主仓库的证据和功能加 `repo` 写仓库标识，路径相对那个仓库的根目录，不要写绝对路径。
3. **AI 归纳的一律是推断**。对象的业务作用、流程顺序、读写范围这类靠理解得出的结论，保留 `inferred`。「已确认」只表示代码支持，不表示线上验证过。
4. **说业务话**。名称、说明、标签写给不看代码的人看：「借阅证」而不是 `reader_card`，「挂失」而不是 `UpdateStatus`。表名、方法名只出现在 `tableName`、`http`、`method`、证据里。
5. **私有数据不外泄**。真实项目的地图默认放 BizAtlas 的 `.local/`（已被 Git 忽略）；用户明确同意才放进源码仓库；任何时候都不要放进 `examples/`。

## 第 0 步：先问清楚

开始前和用户确认（已经说过的不用再问）：

- 源码根目录在哪，默认是当前打开的仓库。
- **这个系统还有没有别的仓库**：先自己找线索再问，别让用户凭空回忆，比如同级目录里名字相近的仓库、配置里连同一个数据库的仓库。列出来请用户确认要不要一起画；同一套业务的多个仓库画在同一张地图上，每个仓库起一个短英文小写标识（如 `main`、`gateway`），第一个是主仓库。
- 只看其中哪些模块：先扫一遍目录和菜单，把找到的子系统 / 模块列给用户挑，不要让用户自己报名字；大项目建议先挑一两个核心模块做第一版，其余后面追加。
- 项目标识：短英文小写，如 `my-app`，默认取源码根目录名；用来登记和切换项目。
- 地图放在哪，**把差别讲给用户听再让用户选**：
  - 默认 `<BizAtlas>/.local/<项目标识>/.bizatlas/`：只留在本机，不进业务项目的仓库。
  - `<源码根>/.bizatlas/`：会跟着业务代码一起提交，适合团队共享。
- 界面语言：默认中文。

生成脚本放在地图目录旁边（`.bizatlas/` 的上一级），跟着地图走。

## 第 1 步：摸清项目

快速扫一遍，记下各类信息**在哪**，后面都从这里取证据：

| 要找的 | 常见位置 |
| --- | --- |
| 表结构 | 建表 SQL、migration、ORM 实体类（`@Entity`、`[Table]`、`[SugarTable]`、`models.py`、Prisma schema …） |
| 表之间的引用 | 外键约束、`xxx_id` 字段、字段注释里写的「关联 xxx.Id」、导航属性 |
| 功能 / 接口 | 控制器、路由定义、RPC 服务、GraphQL resolver |
| 谁在用接口 | 前端 API 封装、页面文件里的调用 |
| 业务名词 | 菜单、页面标题、字段注释、枚举、文档 |

## 第 2 步：map.json（必需）

按这个顺序整理，每一步都能对上前一步：

1. **领域 `domains`**：3–8 个业务板块（如「馆务」「流通」「馆藏」）。
2. **对象 `objects`**：业务名词，不是表。一个对象常对应一张主表加若干附属表；纯关联表、日志表一般不单独成对象，挂到相关对象的 `tableRefs` 里当 `supporting`。核心对象标 `importance: "core"`。
3. **表目录 `tables`**：每张表一条，`id` 用 `t-` 前缀，`name` 写中文名，`tableName` 写真实表名，证据指向建表语句或实体类声明。
4. **关系 `relations`**：只写业务上有意义的关联。方向按 source → target 读得通（「分馆 归属 图书馆」）；`cardinality` 要有依据（归属字段、关联表、唯一约束），`1-n` 表示 source 是「一」端，多对一就把方向反过来写；当前 / 历史关系、可为空等口径写进 `note`。
5. **流程 `flows`**：当前界面不展示，写空数组 `[]` 即可；操作先后放到第 5 步的 process.json 里表达。
6. **布局 `layout`**（可选）：不写就按领域自动分列。

写完立刻在 `<BizAtlas>` 目录下校验，有错先修：

```bash
npm run validate -- <输出目录>
```

## 第 3 步：functions.json（建议）

从控制器 / 路由逐个取接口，挂到它所属的对象下：

- `name` 用业务话；`group` 用页面或控制器分块；`kindName` 只能用协议里列的那几种。
- `source` 判定：前端页面里调用的是 `page`；下拉选项、编号校验这类给别的功能用的是 `quick`；回调、外部平台对接是 `ext`；全前端都搜不到调用的是 `unused`。
- `callers` 写调用它的前端文件，能帮人判断这个接口用在哪。

## 第 4 步：tables.json（建议）

对表目录里的每张表解析字段：名称、类型、注释、主键、非空。

字段引用 `ref` 的判断顺序：

1. 外键约束或注释里明确写了引用哪张表 → `{ "tableId": ... }`。
2. 只能按字段名猜（`reader_id` → 读者表）→ 加 `"guess": true`，界面会用虚线标出。
3. 引用的表不在表目录里 → 用 `{ "tableName": ... }`，只显示名字。

查看器靠这些引用算「上游表 / 下游表」，并且只显示直接依赖，所以主键和非空要尽量准：经由非空引用能间接到达的表，不会再显示为直接上游。

## 第 5 步：process.json（可选）

把「做了之后别人会用到」的操作排成先后：新增、审批、状态变更这类；查询、导出、下拉不上图。

- 模块 `modules` 按业务先后从左到右排，模块内的操作从上到下排。
- `pre` 只写**直接**前置（做 B 之前必须先有 A 的结果），间接的查看器会自己推；可有可无的前置加 `"optional": true` 并写 `note`。
- `picks` 写做这个操作时要先选的上级对象；`writes` 写落到哪些表、为什么。
- 和外部平台的交互写进 `province`（`sync` 当场对接 / `manual` 另行上报 / `none` 不交互），平台叫法用顶层 `provinceLabel`。
- 能对上 functions.json 里某个功能的，用 `fn: { "http": "..." }` 关联，卡片和流程图就能互相跳转。

## 用脚本生成，别手抄行号

项目稍大就把整理过程写成一个可重复运行的 Node 脚本（放在输出目录旁边），用关键字在源码里定位证据行号，代码一改重跑即可：

```js
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(process.argv[2]);           // 源码根
const cache = new Map();
const lines = f => cache.get(f) ?? cache.set(f, readFileSync(resolve(root, f), 'utf8').split(/\r?\n/)).get(f);
// 找不到就报错，避免写出指错位置的证据
export function ev(file, needle) {
  const i = lines(file).findIndex(l => l.includes(needle));
  if (i < 0) throw new Error(`证据不存在：${file} / ${needle}`);
  return { file, line: i + 1, excerpt: lines(file)[i].trim() };
}
// 用法：{ id: 't-loan', name: '借阅记录', tableName: 'loan', confidence: 'confirmed', evidence: [ev('db/loan.sql', 'CREATE TABLE loan')] }
```

字段、接口这类量大的数据，直接解析建表 SQL / 实体类 / 控制器生成；对象划分、业务说明、流程这些需要理解的部分，在脚本里手写。

## 更新已有地图

用户说「把这个仓库加进 xx 的业务地图」时：在 `<BizAtlas>/.local/projects.json` 里找到那个项目，把当前仓库加进它的 `sources`，在 `project.repos` 里补上这个仓库，再整理这个仓库的内容合并进同一张地图。共享同一个数据库的，表目录只有一份，在对象卡片的功能和流程图里把两个系统怎么交接（谁写、谁读、谁先谁后）连起来。

代码有变化时：先重跑生成脚本；没有脚本就按 `evidence` 逐条核对行号是否还对得上，失效的修正或降为 `inferred`；新增的表、接口按上面的步骤补齐，最后再跑一次校验。

## 收尾

1. 在 `<BizAtlas>` 目录下 `npm run validate -- <输出目录>` 通过。
2. 登记项目：在 `<BizAtlas>/.local/projects.json` 的 `projects` 数组里加一条（同 `id` 已存在就更新，别动别的项目；文件不存在就新建）：

   ```json
   { "projects": [
     { "id": "my-app", "name": "我的应用", "dataDir": "D:/work/my-app/.bizatlas",
       "sources": { "main": "D:/work/my-app", "gateway": "D:/work/my-gateway" } }
   ] }
   ```

   路径用绝对路径（放在 `.local/` 下的也可以写相对 `<BizAtlas>` 的路径）。`sources` 的键和 `project.repos` 的仓库标识一一对应，顺序一致；只有一个仓库时也可以写 `"sourceDir": "D:/work/my-app"`。配了源码目录才能用界面上的「问 AI」，它会在这些仓库里一起查。
3. 打开查看器：所有登记的项目共用一个查看器，左上角下拉切换。
   - 先看 http://127.0.0.1:5173 是否已有查看器在跑：在跑就让用户刷新页面，在左上角选这个项目。
   - 没在跑：在 `<BizAtlas>` 目录下后台运行 `npm run dev -- --project <项目标识>`，把终端里打印的地址告诉用户。
4. 向用户汇报：整理了几个领域、多少对象 / 关系 / 表 / 功能，哪些部分是推断、哪些模块还没覆盖，建议重点人工核对的地方。
