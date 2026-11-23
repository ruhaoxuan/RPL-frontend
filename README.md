# RPL Atlas

RPL 模式与 Rust 实例的只读知识库，基于 React、TypeScript 和 Vite。源码来自锁定版本的 RPL 子模块，收录关系由本仓库的元数据维护。

## 功能

- 模式目录：来源统计、占比图、搜索、组合筛选、排序及分页。
- 模式详情：分组诊断说明、关联检测规则、原因与修改建议、完整 RPL 代码。
- 实例详情：预期结果、历史诊断基准、关联模式及 Rust 代码。
- 页内源码定位、行高亮、代码复制及固定版本的 GitHub 原文件入口。

当前收录 53 条模式、110 个文件级实例：91 个 Positive、19 个 Negative。实际结果目前为 `Not Run`，模式状态为待验证。

## 环境要求

- Node.js 24 和 npm。
- Git，用于初始化子模块和读取源码提交信息。
- Python 3，仅运行完整测试时需要，无额外 Python 依赖。

启动和构建无需安装 Rust，也不会执行 RPL 检测。

## 本地启动

```sh
git clone --recurse-submodules https://github.com/ruhaoxuan/RPL-frontend.git
cd RPL-frontend
npm ci
npm run dev
```

若已经克隆仓库，先执行：

```sh
git submodule update --init --recursive
```

打开终端显示的地址，默认是 [http://127.0.0.1:5173/](http://127.0.0.1:5173/)。`dev` 会先生成展示数据。停止服务按 `Ctrl + C`。

## 构建与测试

```sh
npm run build
npm test
```

构建依次执行数据生成、数据校验、TypeScript 检查及 Vite 打包，产物位于 `dist/`。

浏览器验收先安装 Chromium：

```sh
npx playwright install chromium
```

然后在一个终端启动预览：

```sh
npm run preview -- --port 5173 --strictPort
```

在另一个终端执行：

```sh
npm run test:browser
```

如预览使用其他端口，可设置 `TEST_URL=http://127.0.0.1:5180 npm run test:browser`。截图和结果写入 `test-results/`。

## 模式—实例对应关系

- [可阅读的完整对应表](docs/pattern-instance-mapping.md)：列出模式、实例路径、类型、预期结果和诊断名称。
- [允许收录的机器可读对应表](metadata/allowed-pairs.json)：构建所使用的唯一收录依据，随仓库提交。

修改对应关系后，更新文件内容哈希和相关测试基线，再执行：

```sh
npm run data:table
npm run build
npm test
```

`data:table` 仅从仓库元数据生成可阅读表格；不会改变收录范围。构建检查表格是否同步，并拒绝重复关联、预期冲突、失效路径或未经核对的源码变化。

当前模型允许关联多个模式；同一实例在不同模式下预期类型不同时会明确拒绝，需先升级为关联级预期模型。

## 数据与目录

```text
vendor/RPL/                上游源码子模块
metadata/allowed-pairs.json 模式—实例对应关系及校验信息
metadata/curated.ts         展示用说明
scripts/                   数据生成、校验及维护工具
src/                       页面、组件、样式和领域逻辑
docs/                      随仓库提供的说明与对应表
tests/                     数据逻辑与浏览器验收
public/generated/          生成的目录与代码资源，不提交
dist/                      静态网站产物，不提交
```

所有启动、构建及测试所需的源码、配置、元数据和说明均随仓库提供。保留在元数据中的历史出处信息仅用于维护核对，不进入页面或发布数据，也不会触发对原始材料的读取。

`.stderr` 是上游预期诊断基准，不自动表示模式已经正确检测。实际结果和验证结论与基准信息分开保存；诊断级别 `warn` / `deny` 也不代表验证状态。

## 数据源同步时间

首页名称下方显示最近成功同步时间；“查看数据源”进入数据说明页的完整同步状态。

```sh
npm run data:sync
npm run build
```

`data:sync` 先调用与后台任务完全相同的检查入口，保存检查结果，再由拉取入口准备检查确定的 RPL 版本，在临时快照中完成校验，通过后才更新成功时间和固定版本。失败保留上次成功时间；内容无变化但检查成功也会更新时间。普通启动、构建、刷新不更新时间。初始没有历史记录时显示“尚未记录”。记录保存在 `metadata/data-sources.json`，需随仓库提交。

同步时间表示数据已准备好供前端使用，不表示规则文件的修改日期、检测时间或站点发布时间。时间以 UTC 保存，页面按浏览器时区显示。同步后仍需重新构建、发布站点。

数据说明页的每个来源末尾提供“手动同步”按钮。本地启动和预览时可用；纯静态部署只读，按钮会说明同步服务不可用。每个来源通过注册适配器分别提供 `check` 与 `pull`，公共流程统一保存状态及执行发布回退，后续可接入网页脚本。

详见[数据源同步与时间定义](docs/data-source-sync.md)，包括失败回退、收录校验及中断恢复边界。

## 定期检查数据源更新

本地服务启动约 5 秒后检查到期来源，默认每 6 小时查询一次。数据说明页可以查看检查时间、更新状态，页面仅保留“手动同步”按钮，同步会同时刷新更新检查结果。自动检查只在本地服务运行时执行，纯静态部署不执行。

```sh
npm run data:updates -- rpl
```

该命令只查询远端版本，不切换子模块、不收录新增内容、不改变成功同步时间。检查记录保存在 `updateCheck`；同步尝试时间单独保存为 `lastSyncAttemptAt`。各来源开关和间隔在 `metadata/data-sources.json` 中配置。验收步骤、失败与时间定义见[同步及检查文档](docs/data-source-sync.md#验收步骤)。

## 更新上游与部署

```sh
npm run data:sync
git diff --submodule=log -- vendor/RPL
```

检查受影响的规则与实例，必要时更新对应元数据及表格，再构建和测试，最后一起提交子模块指针与本仓库变化。日常 CI 使用锁定提交，不自动跟踪最新上游。

部署时发布 `dist/`。HashRouter 支持静态托管的详情页刷新。子目录部署可使用：

```sh
VITE_BASE=/RPL-frontend/ npm run build
```

## 来源

规则与案例来自 [RPL Toolchain](https://github.com/RPL-Toolchain/RPL)，上游采用 MPL-2.0，详见其 LICENSE。
