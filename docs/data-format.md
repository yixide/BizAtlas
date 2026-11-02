# 地图数据协议 v0

```text
your-project/
└── .bizatlas/
    └── map.json
```

使用单个 JSON 快照：v0 的对象、关系、表与流程数量较小，一次读取并校验全部引用更简单；便于复制目录、离线加载与 Git 比较。暂不使用 JSONL，避免多文件读取顺序与不完整更新。协议独立于 G6，不保存图引擎内部数据。

## 顶层字段

| 字段 | 含义 |
| --- | --- |
| `schemaVersion` | 固定字符串 `"0"`；不支持的版本拒绝加载 |
| `project` | 项目名称、业务说明、生成时间，可选源码版本 `sourceRevision`；系统由多个仓库组成时，可选 `repos` 列出各仓库 `{id, name}`，第一个是主仓库 |
| `domains` | 领域：`id`、`name`、`description` |
| `objects` | 业务对象 |
| `relations` | 有向业务关系 |
| `tables` | 数据表目录，避免多个对象重复定义同一表 |
| `flows` | 有序业务流程 |
| `layout` | 可选 `positions`，以对象 ID 映射 `{x,y}` 的查看布局提示；未提供时自动按领域分列 |

## 对象与信息可信度

对象包含 `id`、`name`、`domainId`、`summary`、`tableRefs`、`prerequisites`、`confidence`、`evidence`，可选 `importance: core | normal`。

- `summary` 是 `{text, confidence, evidence}`，一两句话说明业务作用。
- `prerequisites` 是同结构的信息数组；为空时不显示运行前提。
- `tableRefs` 用 `{tableId, role: primary | supporting}` 指向表目录。表目录包含 `id`、中文 `name`、实际 `tableName`、`confidence`、`evidence`。
- 对象层的可信度表示对象及主表识别；说明、前提、表、关系、流程及步骤各自独立标注，不能从对象层向下继承“已确认”。表关联角色在 v0 作为对象映射的一部分，与其证据一同核对。

`confidence` 只有两种值：`confirmed`（已确认）、`inferred`（推断）。所有信息显式提供 `evidence`，推断允许空数组；已确认必须至少有一条证据。证据为 `{repo?, file, line, excerpt?}`，行号从 1 开始。路径默认相对于源码根目录；多仓库时 `repo` 写 `project.repos` 里的仓库标识，路径相对该仓库根目录，不写 `repo` 就是第一个仓库，界面显示为 `仓库标识:文件:行号`；`@atlas/` 前缀表示查看器工作目录中的参考材料。证据只在默认折叠的证据区域显示。

已确认意味着代码或建表定义支持该信息，**不是数据库现场核对或业务运行验证**。AI 归纳的作用、流程、顺序和读写范围应保留推断标记。虚构样例的全部内容均标为推断。

## 关系

关系字段：`id`、`source`、`target`、`type`、`label`、`cardinality`、`confidence`、`evidence`，可选 `note`。

- `type`：`owns`（起点拥有终点）、`belongs-to`（起点归属终点）、`uses`（起点使用终点）、`associates`（起点关联终点）。
- `label`：界面显示的中文短语，例如“下属”“绑定”。
- `cardinality`：`1-1`、`1-n`、`n-n`，按 source → target 方向解释；如果源端为多端，请反向定义关系来表达一对多。
- v0 仅表达最大基数，不区分可选与必填。当前关系、历史关系的口径和空值含义应写进 `note`。一对多不能只凭猜测；归属字段、关联表和业务唯一性约束应一并作为证据。

## 流程

当前查看器不展示 `flows`，可以写空数组；操作之间的先后请用下文的 process.json 表达。

流程包含 `id`、`name`、`description`、`objectIds`、`steps`、`confidence`、`evidence`。`steps` 数组顺序就是展示顺序。

步骤包含 `id`、`description`、`objectIds`、`reads`、`writes`、`confidence`、`evidence`。`reads` 和 `writes` 是表 ID 数组，空数组表示该步未声明本地表读写。分支步骤需要在业务文案中写明条件，不能把可选分支写成必经步骤。流程的 `objectIds` 必须覆盖全部步骤对象，用于对象卡片反向关联流程。

## 可选文件

```text
.bizatlas/
├── map.json         # 必需：领域、对象、关系、表目录、流程
├── functions.json   # 可选：每个对象有哪些功能（接口 / 操作）
├── process.json     # 可选：功能之间的先后，供「流程图」视图
└── tables.json      # 可选：表字段与字段间引用，供「数据表」页签
```

可选文件缺失时对应界面不显示或只显示基础信息；它们只做读取，不参与 `npm run validate`，修改后同样自动刷新。

## 功能清单 functions.json（可选）

键是对象 `id`，值是该对象的功能数组。对象卡片的「功能」页签按 `group` 分组、按 `kindName` 着色，并按 `source` 分成几类：

```json
{
  "loan": [
    { "name": "借出图书", "group": "借还台", "kind": "add", "kindName": "新增",
      "http": "POST /loan/borrow", "method": "Borrow",
      "file": "src/controllers/LoanController.cs", "line": 24,
      "source": "page", "callers": ["views/desk/index.vue"] }
  ]
}
```

| 字段 | 含义 |
| --- | --- |
| `name` / `group` | 功能名（用业务话说，如「借出图书」）；分组，通常是页面或控制器里的一块 |
| `kind` / `kindName` | 动作类型代码和中文名。`kindName` 取 `查询`、`新增`、`编辑`、`删除`、`审批`、`状态变更`、`导入`、`导出`、`上报同步`、`其他` 之一，决定颜色和排序 |
| `http` / `method` | 接口（`方法 路径`）和后端方法名；没有 HTTP 的写空字符串 |
| `repo` / `file` / `line` | 功能定义的位置，相对源码根目录；`repo` 可选，多仓库时写仓库标识，规则同证据 |
| `source` | 可选，谁在用：`page` 管理页面、`quick` 给其他功能调的快速接口（下拉、校验）、`ext` 外部对接、`unused` 没找到调用处。缺省按 `page` |
| `callers` | 可选，调用它的前端文件；以 `views/` 开头的计为页面数 |

## 流程图数据 process.json（可选）

流程图里的节点都是**功能**（一个具体操作，如「新增班级」），连线是功能之间的先后：做 B 之前要先有 A 的结果，就写 B 的 `pre` 含 A。只放「做了之后别人会用到」的操作；查询、导出、下拉选项不上图。文件不存在时视为空，界面不显示「流程图」切换。

```json
{
  "provinceLabel": "外部平台",
  "modules": [
    { "id": "setup", "name": "馆务设置", "ops": ["library.add", "branch.add"] }
  ],
  "ops": {
    "branch.add": {
      "objectId": "branch", "name": "新增分馆", "action": "新增", "page": "分馆管理",
      "fn": { "http": "POST /branch/add" },
      "pre": [{ "op": "library.add" }, { "op": "staff.add", "optional": true, "note": "说明" }],
      "picks": [{ "objectId": "library", "label": "所属图书馆" }],
      "writes": [{ "name": "分馆档案", "tableName": "branch", "why": "保存分馆" }],
      "province": { "mode": "none", "text": "不和外部平台交互" },
      "extras": ["其他说明"],
      "evidence": [{ "file": "src/BranchService.cs", "line": 42 }],
      "confidence": "inferred"
    }
  }
}
```

| 字段 | 含义 |
| --- | --- |
| `modules` | 模块，数组顺序即流程图里从左到右的先后；`ops` 是本模块的操作 ID，顺序即列内从上到下 |
| `ops` | 以操作 ID 为键的操作表；不在任何模块里、或 `objectId` 不在 `map.json` 里的操作不上图 |
| `objectId` | 操作所属的业务对象，「打开卡片」时打开它 |
| `name` / `action` / `page` | 操作名；动作类型（新增、编辑、审批、状态变更等，决定颜色）；在哪个页面操作 |
| `fn` | 可选，指向 `functions.json` 里该对象的某个功能，按给出的 `http`、`method`、`group`、`name` 全部相等匹配。匹配上时，卡片里这个功能会显示流程信息，「打开卡片」会直接定位到它 |
| `pre` | 直接前置：`op` 为操作 ID；`optional: true` 表示可选依赖（虚线）；`note` 说明为什么依赖。全部前置、全部后续由查看器递归算出 |
| `picks` | 做这个操作时要先选的上级：`{objectId, label}` |
| `writes` | 数据存到哪些表：`{name, tableName?, why?}`；表名只在打开「代码」图层时显示 |
| `province` | 和外部监管平台怎么交互：`mode` 为 `sync`（当场对接）、`manual`（另行上报）、`none`（不交互），`text` 写具体说明 |
| `extras` / `evidence` | 额外说明；代码证据 `{repo?, file, line}`，只在「代码」图层显示 |
| `confidence` | `confirmed` 或 `inferred`，推断项节点用虚线框 |
| `provinceLabel` | 可选，界面上外部平台的叫法，默认「外部平台」 |

## 表字段 tables.json（可选）

对象卡片「数据表」页签用它显示字段，并按字段上的引用算出上游表（本对象的表里存了谁的 ID）和下游表（谁的表里存了本对象的 ID）。键是表目录里的表 `id`：

```json
{
  "t-loan": {
    "columns": [
      { "name": "id", "type": "bigint", "pk": true, "comment": "主键" },
      { "name": "reader_id", "type": "bigint", "required": true, "comment": "借阅人", "ref": { "tableId": "t-reader" } },
      { "name": "operator_id", "type": "bigint", "comment": "经办人", "ref": { "tableName": "sys_user" } }
    ]
  }
}
```

| 字段 | 说明 |
|---|---|
| `columns[].name` / `type` / `comment` | 字段名、类型、说明 |
| `pk` / `required` | 主键、非空 |
| `ref` | 引用：`tableId` 指向表目录里的表（可点跳转，参与上下游计算），`tableName` 指向目录外的表（只显示名字）；`guess: true` 表示按字段名推断，界面用虚线 |
| `from` | 可选，字段来源说明，如 `entity` 表示取自实体类而非建表语句 |

没有这个文件时，数据表页签只列表名。

## 校验与版本演进

```powershell
npm run validate -- path/to/.bizatlas
```

校验 JSON Schema、跨目录全局 ID 唯一性、领域与对象/表引用、流程对象覆盖、已确认信息必备证据。校验不打开源文件，也不保证代码语义或证据新鲜度；应由地图维护者在更新快照时检查源码行号。

v0 不自动迁移：后续不兼容变更必须提升 `schemaVersion`，保留原快照后重新生成。不要将私有源码、真实项目地图或密钥放入公开示例。
