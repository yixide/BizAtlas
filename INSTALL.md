# 给 AI 代理的安装说明

> 这份文件写给 AI 编码代理（Claude Code、Codex、Cursor 等）。用户把 BizAtlas 的仓库地址交给你，并让你「安装」「用它给这个项目画业务地图」时，按下面的步骤做。安装过程不用向用户提问，装好后再问。

## 1. 检查环境

- `git --version` 能运行。
- `node --version` 不低于 22.12（或 24+）。不满足就停下，告诉用户需要先安装或升级 Node.js，不要自行安装。

## 2. 获取 BizAtlas

安装位置默认是**用户主目录下的 `BizAtlas` 文件夹**（Windows 为 `%USERPROFILE%\BizAtlas`，macOS / Linux 为 `~/BizAtlas`）。用户指定了别的位置就用用户的。

- 目录不存在：

  ```bash
  git clone https://github.com/yixide/BizAtlas.git ~/BizAtlas
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
