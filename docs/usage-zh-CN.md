# REA 中文使用教程（Windows）

REA 在本机检查应用、程序集、二进制文件及浏览器行为。可以直接运行命令，也可以通过 MCP 交给 AI 助手调用。

## 本地中文支持

本仓库增加了 `REA_LOCALE=zh-CN`：安装向导、确认与取消提示、常用命令的中文说明，以及安装和 .NET 检查的常用参数说明。

这是当前源码中的修改，尚未发布到 npm。安装公开的 `rea-agents` 包不等于安装了本地修改。要使用这些中文提示，请先构建本仓库。

命令名称、参数名称、JSON 字段、状态码和 Evidence 保持原有形式。帮助中的中文命令摘要后保留英文原始说明，以保留详细约束。尚未翻译的参数、Incur 提供的帮助标题和内置选项、分析结果及第三方引擎诊断仍可能显示英文。可以要求 AI 助手用中文解释结果，但应保留原始证据。

## 1. 准备与构建

仓库的 `.nvmrc` 固定 Node.js 24.22.1，`package.json` 固定 npm 11.16.0。先检查当前终端：

```powershell
node --version
npm --version
```

版本符合后，在 PowerShell 中运行：

```powershell
Set-Location E:\test\ReverseApp
npm ci
npm run build:cached
```

Windows 源码检出还需要与仓库版本一致的原生组件。如果构建提示缺少
`native/windows/build/manifest.json`，按 [Windows 原生组件恢复说明](https://github.com/morluto/rea/blob/main/native/windows/README.md#restore-the-artifact-in-a-source-checkout)
从与 `package.json` 版本完全一致的已发布包恢复 `manifest.json` 和
`rea-windows-x64.node`，再运行构建。不要混用其他版本，也不要用 `latest` 代替精确版本。

如果修改代码，重新运行 `npm run build:cached` 更新产物。源码入口是 `scripts/rea.mjs`，运行时产物位于 `dist`。

## 2. 开启中文

在同一个 PowerShell 窗口中执行：

```powershell
Set-Location E:\test\ReverseApp
$env:REA_LOCALE = "zh-CN"
node .\scripts\rea.mjs --help
node .\scripts\rea.mjs setup --help
node .\scripts\rea.mjs inspect-managed-members --help
```

语言设置只影响该终端及其启动的进程，不会永久修改系统环境。也接受 `zh`、`zh_CN`、`zh-Hans`。恢复英文：

```powershell
$env:REA_LOCALE = "en"
```

未设置或使用其他语言值时回退为英文。语言不会改变目标选择、安装批准、解析规则或分析结果。

## 3. 检查环境

```powershell
node .\scripts\rea.mjs doctor
node .\scripts\rea.mjs providers
node .\scripts\rea.mjs capabilities
```

`doctor` 返回诊断；`providers` 查看引擎；`capabilities` 查看能力。某个可选引擎未安装，不代表所有功能都不可用。

| 想分析的目标                        | 额外准备                                         |
| ----------------------------------- | ------------------------------------------------ |
| .NET DLL/EXE 的元数据、类型和 IL    | 内置静态解析，不需要 Ghidra，也不执行程序集      |
| JavaScript 应用目录或 Electron ASAR | 内置静态分析，不需要原生反编译引擎               |
| 原生 EXE/DLL 的函数和伪代码         | 配置当前平台支持的 Ghidra、IDA 等引擎            |
| APK 的类和方法                      | 按 Android 指南准备 JADX/JDK 等依赖              |
| 网站运行时                          | 准备受支持浏览器；运行时操作需明确目标和操作范围 |

## 4. 分析自己的 .NET 程序集

下列路径为示例，请替换为存在的文件。先查看程序集身份、引用与元数据覆盖情况：

```powershell
node .\scripts\rea.mjs inspect-managed-artifact "E:\apps\Demo.dll" --json
```

再查看类型、成员、IL 和调用关系：

```powershell
node .\scripts\rea.mjs inspect-managed-members "E:\apps\Demo.dll" --json
```

按结果中的完整类型名缩小范围：

```powershell
node .\scripts\rea.mjs inspect-managed-members "E:\apps\Demo.dll" --type "Demo.Services.OrderService" --json
```

普通类型使用完整名称；嵌套类型还接受其简单名称，可能选择多个同名嵌套类型。`--type` 可以重复传入。没有找到类型时，应检查选择范围和覆盖情况，不能直接断言目标没有相关功能。

保存完整证据包，同时只显示摘要：

```powershell
New-Item -ItemType Directory -Force .\reports | Out-Null
node .\scripts\rea.mjs inspect-managed-members "E:\apps\Demo.dll" --type "Demo.Services.OrderService" --detail summary --evidence-bundle ".\reports\members.json" --json
```

证据包路径必须尚不存在；再次运行时换一个文件名。`summary` 要与 `--evidence-bundle` 一起使用。REA 提供元数据和 IL 检查，不保证还原原始 C# 源码、注释或完整工程。

## 5. 分析 Electron / JavaScript 应用

输入已解包的应用目录或 `app.asar` 文件：

```powershell
node .\scripts\rea.mjs analyze-javascript-application "E:\apps\Demo\resources\app.asar" --json | Out-File -Encoding utf8 .\reports\app-evidence.json
```

先按上一节创建 `reports` 目录。结果包含模块、依赖和 Electron 边界；大型应用可能产生较大的证据文件。

在 PowerShell 7 中读取摘要：

```powershell
$request = @{
  source = @{ kind = "evidence-file"; path = (Resolve-Path .\reports\app-evidence.json).Path }
  view = @{ kind = "summary" }
} | ConvertTo-Json -Depth 4
$request | node .\scripts\rea.mjs inspect-analysis-view - --json
```

这些是静态检查；分析目录或 ASAR 不需要启动被分析的应用。旧版 Windows PowerShell 的管道和文件编码可能不同，遇到 JSON 编码错误时使用 PowerShell 7，并保存为 UTF-8。

## 6. 分析原生 Windows 程序

先按[安装指南](installation.md#ghidra)准备并配置引擎，再检查可用状态：

```powershell
node .\scripts\rea.mjs providers
node .\scripts\rea.mjs doctor
node .\scripts\rea.mjs analyze "E:\apps\NativeDemo.exe" --json
node .\scripts\rea.mjs decompile --help
node .\scripts\rea.mjs xrefs --help
```

使用分析结果中实际返回的函数名或地址进行后续查询；不同目标架构和引擎的覆盖范围不同。缺少引擎时，先处理诊断给出的安装路径或配置问题。

## 7. 接入 AI 助手

在开启中文的终端中运行当前源码入口：

```powershell
node .\scripts\rea.mjs setup
```

1. 用方向键移动，空格选择助手，回车确认。
2. 检查将写入的配置路径、备份位置、命令和外部软件。
3. 确认后应用；不希望修改时选择取消。
4. 按完成提示重启选定助手。

需要逐项选择时，使用 `setup --accessible`。只想看计划时使用 `setup --dry-run`；需要机器可读计划时再加 `--json`。不要把 `--yes` 当作查看计划的选项。

接入后可以这样提问：

> 使用 REA 静态分析 E:\apps\Demo.dll，先说明程序集与类型，再查看订单保存逻辑。用中文解释，列出证据位置、分析局限和未确认项，不运行目标程序。

或者：

> 使用 REA 分析 E:\apps\Demo\resources\app.asar，梳理登录流程、网络接口和 IPC 调用。先返回摘要，再按需要读取具体模块，用中文说明结论。

向导记录当前运行时和入口路径；请保留这份源码及构建产物。这里的语言设置控制本地 CLI 显示，不自动修改 MCP 的工具契约或模型回答语言。

## 常见问题

| 现象                             | 处理方法                                                     |
| -------------------------------- | ------------------------------------------------------------ |
| `rea` 不是可识别的命令           | 源码方式使用 `node .\scripts\rea.mjs`                        |
| Node.js 版本太旧                 | 切换到仓库固定版本，重新打开终端核对                         |
| 提示 compiled runtime is missing | 在仓库运行 `npm ci` 和 `npm run build:cached`                |
| 设置中文后仍然是原来的帮助       | 确认使用的是当前源码入口、已经重新构建，并在同一终端设置变量 |
| 部分帮助、诊断或 JSON 仍是英文   | 当前中文覆盖界面提示及常用说明，未翻译文本保留原文           |
| 分析结果太大                     | 缩小类型/模块范围，保存 Evidence 后读取摘要或分页            |
| 找不到分析引擎                   | 运行 `doctor`，按对应引擎指南配置，再检查可用能力            |

进一步阅读：[中文项目介绍](https://github.com/morluto/rea/blob/main/docs/readme/README_zh.md)、[CLI 和 Evidence](cli.md)、[.NET 分析](managed-code-analysis.md)、[JavaScript 分析](javascript-application-workflows.md)。
