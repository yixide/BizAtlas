# 给 AI 代理的安装说明

> 这份文件写给 AI 编码代理（Claude Code、Codex、Cursor 等）。用户把 BizAtlas 的仓库地址交给你，并让你「安装」「用它给这个项目画业务地图」时，按下面的步骤做；让你「卸载」时，直接看最后的[卸载](#卸载)。安装过程只问用户一件事：装在哪；其余装好后再问。

## 1. 检查环境

- `git --version` 能运行。
- `node --version` 不低于 22.12（或 24+）。不满足就停下，告诉用户需要先安装或升级 Node.js，不要自行安装。

## 2. 获取 BizAtlas

BizAtlas 是一个独立的本机工具，所有项目共用一份，**不要装进用户当前的业务项目里**。

先找已有的安装：用户说过的位置，或用户主目录下的 `BizAtlas`。找到了就直接更新，不用问。

没找到时问用户一句装在哪，并给出默认值：**用户主目录下的 `BizAtlas` 文件夹**（Windows 为 `%USERPROFILE%\BizAtlas`，macOS / Linux 为 `~/BizAtlas`），依赖约占几百 MB。用户说「默认」或没有偏好就用默认值；用户在一开始已经指定位置的，不用再问。

- 目录不存在：

  ```bash
  git clone https://github.com/yixide/BizAtlas.git <安装位置>
  ```

- 目录已存在且是 BizAtlas 仓库：进去执行 `git pull` 更新。

然后在该目录下：

```bash
npm install
```

## 3. 安装 skill

把仓库里的 `skills/bizatlas/` 整个目录复制到你自己的个人 skills 目录，已存在就覆盖：

| 代理 | 目标目录 |
| --- | --- |
| Claude Code | `~/.claude/skills/bizatlas/` |
| Codex | `~/.codex/skills/bizatlas/` |
| 其他支持 `SKILL.md` 的代理 | 它的个人 skills 目录 |

复制完在目标目录里新建 `home.txt`，只写一行 BizAtlas 的绝对路径，skill 靠它找到 BizAtlas。

不支持 skill 的代理跳过这一步，后面直接读 `<BizAtlas>/skills/bizatlas/SKILL.md` 照着做。

## 4. 确认安装成功

在 BizAtlas 目录下运行，必须通过：

```bash
npm run validate -- examples/library/.bizatlas
```

## 5. 开始画地图

向用户简短报告：BizAtlas 装在哪、skill 装到了哪。

然后按 `skills/bizatlas/SKILL.md` 从「第 0 步：先问清楚」开始，在用户当前的项目里工作：先向用户确认要整理哪些模块、地图输出到哪里，得到回答后再动手。

用户只是想先看看效果时，在 BizAtlas 目录下后台运行 `npm run dev:example`，把终端打印的地址（默认 http://127.0.0.1:5173）告诉用户。

## 以后更新

用户说「更新 BizAtlas」时：在 BizAtlas 目录 `git pull`、`npm install`，再重复第 3 步覆盖 skill。

## 卸载

用户说「卸载 BizAtlas」时按下面做。删除不可恢复，**先列清单、得到用户确认再删**。

1. 找到 BizAtlas 的位置：skill 目录下的 `home.txt`，没有就看用户主目录下的 `BizAtlas`。
2. 读 `<BizAtlas>/.local/projects.json`，把登记的项目分两类列给用户：
   - 地图在 BizAtlas 的 `.local/` 里：会随 BizAtlas 一起删掉。问用户要不要先备份；要备份就把对应的 `.local/<项目标识>/` 复制到用户指定的位置。
   - 地图在业务项目自己的目录里：默认保留不动。用户明确说也要删，才删那个项目下的 `.bizatlas/` 和旁边的生成脚本。
3. 列出将删除的内容，请用户确认：
   - BizAtlas 目录（含依赖）。
   - 各代理 skills 目录下的 `bizatlas/`（Claude Code 是 `~/.claude/skills/bizatlas/`，Codex 是 `~/.codex/skills/bizatlas/`，有哪个删哪个）。
   - 第 2 步里用户同意删的项目地图。
4. 确认后：先停掉正在运行的查看器（从 BizAtlas 目录启动的那个 `npm run dev`，不要动别的进程），再按清单删除。
5. 不卸载 Node.js、git，也不改业务项目里的其他文件。最后告诉用户删了什么、保留了什么、备份放在哪。
