import { z } from "incur";

import type { CliLocale } from "./locale.js";
import type { CliInstance } from "./types.js";
import { visitRegisteredCommands } from "./visitRegisteredCommands.js";

// These summaries supplement, rather than discard, the canonical command guidance.
const commandSummaries: Readonly<Record<string, string>> = {
  setup: "配置 AI 助手集成及可选分析引擎",
  doctor: "检查运行环境、依赖和配置是否就绪",
  uninstall: "移除 REA 管理的助手配置和技能文件",
  update: "更新当前 REA 安装并验证版本",
  analyze: "分析应用或程序的整体结构",
  inspect: "检查目标文件的基本信息",
  decompile: "反编译指定函数，查看伪代码",
  "decompile-all": "将目标的反编译结果导出到目录",
  function: "分析指定函数并返回证据",
  instructions: "查看指定函数的原始指令",
  search: "搜索字符串或函数名称",
  xrefs: "查询地址或符号的交叉引用",
  trace: "沿引用关系追踪指定功能",
  providers: "列出分析引擎及可用状态",
  capabilities: "查看当前可用的分析能力",
  guidance: "查询分析任务的使用指引",
  "guided-workflows": "查询引导式分析工作流",
  "inspect-desktop-application": "识别桌面应用目录中的运行时和组件",
  "analyze-javascript-application":
    "静态分析 JavaScript 或 Electron 应用目录及 ASAR",
  "inspect-managed-artifact": "检查 .NET 程序集身份和元数据，不执行目标代码",
  "inspect-managed-members": "检查 .NET 类型、成员、签名、IL 和字符串",
  "inspect-managed-native-boundaries": "检查 .NET 声明的原生调用边界",
  "compare-managed-members": "比较两个 .NET 程序集版本的成员",
  "verify-managed-native-boundaries": "用原生分析证据核验 .NET 原生调用声明",
  "import-managed-reconstruction": "导入与已验证成员身份关联的反编译代码",
  "project-managed-application-graph": "将 .NET 分析结果投影为应用关系图",
  "inspect-artifact": "查看文件或归档的结构及内容清单",
  "extract-artifact": "提取选定归档内容",
  "compare-artifacts": "比较两个文件或应用包",
  "inspect-analysis-view": "从已保存的分析证据读取摘要或分页视图",
  "inspect-evidence-bundle": "检查证据包及其完整性",
  "inspect-pe-imports": "查看 Windows PE 的导入和延迟导入",
  "inspect-pe-resources": "查看 Windows PE 资源",
  "inspect-pe-certificates": "查看 Windows PE 证书和签名信息",
  "inspect-pe-load-config": "查看 Windows PE 加载配置",
  "inspect-native-exports": "查看原生文件的导出符号",
  "inspect-binary-hardening": "检查二进制文件声明的安全防护标志",
  "inspect-byte-entropy": "检查文件字节熵分布",
  "inspect-binary-layout": "检查二进制文件布局",
  "read-bytes": "读取目标中的指定字节",
  "search-bytes": "搜索目标中的字节模式",
  "address-to-file-offset": "将虚拟地址映射为文件偏移",
  "inspect-go-binary": "读取 Go 编译器、模块和构建信息",
  "inspect-rust-binary": "读取 Rust 二进制中的依赖元数据",
  "inspect-il2cpp-metadata": "检查 Unity IL2CPP 元数据",
  "identify-flutter-build": "识别 Flutter 构建信息",
  "inspect-dart-aot": "检查 Dart AOT 产物",
  "inspect-python-pyc": "检查 Python 字节码文件",
  "inspect-erlang-beam": "检查 Erlang BEAM 文件",
  "inspect-wasm-artifact": "验证并检查 WebAssembly 文件",
  "compare-wasm-interfaces": "比较 WebAssembly 导入导出接口",
  "inspect-evm-interface": "分析 EVM 字节码接口",
  "inspect-model-artifact": "查看 GGUF 或 safetensors 模型元数据",
  "inspect-gpu-code-objects": "检查 GPU 代码对象和内核元数据",
  "inspect-sqlite-database": "检查 SQLite 结构和选定表数据",
  "inspect-android-package": "检查 Android APK 清单和代码",
  "inspect-apk-signature": "检查 APK 签名结构",
  "search-android-classes": "搜索 Android 类",
  "inspect-android-class": "查看 Android 类及成员",
  "inspect-android-method": "查看 Android 方法的反编译结果",
  "trace-android-references": "追踪 Android 代码引用",
  "inspect-android-jni-bindings": "检查 Android JNI 绑定",
  "decode-android-resources": "解码 Android 应用资源",
  "list-adb-devices": "列出 ADB 设备",
  "list-adb-packages": "列出设备上的应用包",
  "inspect-adb-device": "检查 ADB 设备信息",
  "pull-adb-package": "从选定设备提取应用包",
  "read-adb-logcat": "读取 Android 日志",
  "capture-adb-screen": "截取 Android 设备屏幕",
  "inspect-firmware-regions": "识别固件区域和嵌入内容",
  "extract-firmware": "提取固件内容",
  "inspect-devicetree": "检查设备树",
  "inspect-web-network-capture": "检查保存的网络捕获文件",
  "inspect-pcap-capture": "检查 PCAP 网络捕获",
  "inspect-packet-capture": "检查网络包记录",
  "inspect-packet-fields": "查询网络协议字段",
  "inspect-signal-decoders": "列出信号解码器",
  "decode-signal-recording": "解码信号录制文件",
  "observe-web-execution": "观察网页脚本执行",
  "inspect-web-event-listeners": "查看网页事件监听器",
  "trace-web-source-location": "追踪网页源码位置",
  "trace-web-module-imports": "追踪网页模块导入",
  "inspect-playwright-trace": "检查 Playwright 跟踪记录",
  "inspect-api-contract": "检查 API 契约",
  "inspect-with-objdump": "通过 GNU objdump 检查目标",
  "execute-rizin-command": "执行受支持的 Rizin 分析命令",
  "debug-with-gdb": "通过 GDB 调试目标",
  "debug-with-rizin": "通过 Rizin 调试目标",
  "list-frida-devices": "列出 Frida 设备",
  "list-frida-processes": "列出 Frida 可见进程",
  "instrument-with-frida": "使用 Frida 执行运行时插桩",
  "list-cutter-sessions": "列出 Cutter 会话",
  "cutter-command": "向 Cutter 会话发送命令",
  "environment-build": "根据捕获内容构建分析环境",
  "environment-compare": "比较分析环境",
  "environment-export": "导出 AgentEnv 环境包",
  "environment-serve": "启动分析环境回放服务",
};

// Exact metadata matches only. Untranslated guidance stays available in English.
const descriptions: Readonly<Record<string, string>> = {
  "Approve user-owned setup actions without prompting":
    "批准所选的用户配置操作，跳过交互确认",
  "Also approve Hopper installation with --yes":
    "配合 --yes 同时批准安装 Hopper",
  "Agent integration to configure; repeat for multiple agents":
    "要配置的 AI 助手；可重复指定多个",
  "Existing client skill destination to update; repeatable":
    "要更新的已有助手技能目录；可重复指定",
  "Configure every detected supported agent": "配置所有已检测到的受支持助手",
  "Override the bundled skill included with agent integrations":
    "指定是否安装随助手集成提供的技能",
  "Print the resolved plan without applying it": "只显示配置计划，不执行修改",
  "Use sequential accessible setup prompts": "使用逐项确认的无障碍安装提示",
  "Optional app path to check": "需要检查的应用路径（可选）",
  "Agent registration whose readiness is required; repeatable":
    "需要检查的助手注册；可重复指定",
  "Deep-analysis provider whose readiness is required":
    "需要检查的深度分析引擎",
  "Require the installed REA skill identity to be aligned":
    "要求已安装的 REA 技能版本身份一致",
  "Also remove REA caches and state": "同时移除 REA 缓存和状态数据",
  "App, program, or analysis database path": "应用、程序或分析数据库的路径",
  "App or program path": "应用或程序的路径",
  "Managed PE executable or assembly path":
    "托管 PE 可执行文件或 .NET 程序集路径",
  "Match the query with exact letter case": "查询时区分大小写",
  "Match the pattern with exact letter case": "匹配时区分大小写",
  "Analyzed item kind to search": "要搜索的分析条目类型",
  "Interpret the pattern as literal text or a regex":
    "将模式解释为普通文本或正则表达式",
  "complete returns full Evidence (default); summary returns identity, selection, coverage, limitations and collection counts and requires --evidence-bundle":
    "complete 返回完整证据（默认）；summary 返回身份、选择范围、覆盖情况、局限和数量，必须同时指定 --evidence-bundle",
  "Write complete parent Evidence to a new local bundle for later inspect-analysis-view calls; never replaces an existing path":
    "将完整原始证据写入新的本地证据包，供 inspect-analysis-view 后续读取；不会覆盖已有路径",
  "Inspect only members declared by this exact type full name, and the string literals they load, such as System.Threading.Monitor; a nested type is named by its bare name, which selects every nested type of that name (repeatable)":
    "只检查指定完整类型名声明的成员及其加载的字符串，如 System.Threading.Monitor；嵌套类型使用简单名称，会选择所有同名嵌套类型；可重复指定",
};

/** Clone CLI-only field metadata; shared contracts and parsing stay unchanged. */
const translateFields = (schema: z.ZodObject): z.ZodObject =>
  schema.safeExtend(
    Object.fromEntries(
      Object.entries(schema.shape).map(([name, field]) => {
        const chinese =
          field.description === undefined
            ? undefined
            : descriptions[field.description];
        return [name, chinese === undefined ? field : field.describe(chinese)];
      }),
    ),
  );

/** Localize registered CLI metadata before help/schema/completion consume it. */
export const localizeCliHelp = (cli: CliInstance, locale: CliLocale): void => {
  if (locale !== "zh-CN") return;
  visitRegisteredCommands(cli, (command, path) => {
    const summary = commandSummaries[path];
    if (summary !== undefined)
      command.description =
        command.description === undefined
          ? summary
          : `${summary} / ${command.description}`;
    for (const group of ["args", "options", "env"] as const) {
      const schema = command[group];
      if (schema instanceof z.ZodObject)
        command[group] = translateFields(schema);
    }
  });
};
