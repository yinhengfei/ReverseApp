import {
  cancel,
  confirm,
  intro,
  isCancel,
  multiselect,
  outro,
} from "@clack/prompts";

import type {
  SetupAction,
  SetupConfirmationDecision,
  SetupConfirmationContext,
  SetupClientState,
  SetupProgressEvent,
  SetupResult,
} from "../application/SetupTypes.js";
import { SUPPORTED_CLIENT_DEFINITIONS } from "../application/SupportedClients.js";
import { invokingPackageRunner } from "../application/ClientRegistrationIdentity.js";
import { cliLocale, cliText, type CliLocale } from "./locale.js";

const clientDisplayNames: ReadonlyMap<string, string> = new Map(
  SUPPORTED_CLIENT_DEFINITIONS.map(({ name, displayName }) => [
    name,
    displayName,
  ]),
);

const promptStreams = {
  input: process.stdin,
  output: process.stderr,
  withGuide: true,
} as const;

/** Select agent targets, then review the resolved plan before consent. */
export const confirmInteractiveSetup = async (
  actions: readonly SetupAction[],
  accessible: boolean,
  context?: SetupConfirmationContext,
  locale: CliLocale = "en",
): Promise<SetupConfirmationDecision> => {
  if (context?.stage === "select" || context === undefined) {
    intro(cliText(locale, "REA setup", "REA 安装与配置"), promptStreams);
    writeLine(
      cliText(
        locale,
        "│  Understand local apps and binaries from your terminal or agent.",
        "│  通过终端或 AI 助手分析本地应用和二进制文件。",
      ),
    );
    renderDetectedSummary(context?.clientStates ?? [], locale);
    renderKeyboardHelp(accessible, locale);
  }
  if (context?.stage === "select") {
    const selected = await selectSetupActions(
      actions,
      accessible,
      context,
      locale,
    );
    return selected === undefined
      ? cancelledDecision(locale)
      : { approved: false, selectedActionIds: selected };
  }
  if (actions.length === 0) return { approved: true, selectedActionIds: [] };
  renderPreflight(actions, locale);
  const approved = await confirm({
    ...promptStreams,
    message:
      actions.length === 1
        ? cliText(locale, "Apply this change?", "是否应用这项修改？")
        : cliText(
            locale,
            `Apply these ${String(actions.length)} changes?`,
            `是否应用这 ${String(actions.length)} 项修改？`,
          ),
    initialValue: true,
    active: cliText(locale, "Yes, apply", "是，应用修改"),
    inactive: cliText(locale, "No, cancel", "否，取消"),
    vertical: accessible,
  });
  if (isCancel(approved) || !approved) return cancelledDecision(locale);
  return { approved: true, selectedActionIds: actions.map(({ id }) => id) };
};

/** Render stable, append-only progress for real setup operations. */
export const renderSetupProgress = (
  event: SetupProgressEvent,
  locale: CliLocale = "en",
): void => {
  const symbol =
    event.state === "started"
      ? "◇"
      : event.state === "completed"
        ? "◆"
        : event.state === "warning"
          ? "!"
          : "✗";
  const suffix = event.detail === undefined ? "" : ` · ${event.detail}`;
  const states = {
    started: "正在执行",
    completed: "已完成",
    warning: "提示",
    failed: "失败",
  };
  const state = locale === "zh-CN" ? `${states[event.state]}：` : "";
  writeLine(`${symbol}  ${state}${event.label}${suffix}`);
};

/** Show the resolved dry-run plan to a human at an interactive terminal. */
export const renderSetupDryRun = (
  actions: readonly SetupAction[],
  locale: CliLocale = "en",
): void => {
  intro(cliText(locale, "REA setup plan", "REA 配置计划"), promptStreams);
  renderPreflight(actions, locale);
  outro(
    cliText(
      locale,
      "Dry run complete. No changes were made.",
      "计划预览完成，未作任何修改。",
    ),
    promptStreams,
  );
};

/** Finish an interactive setup journey without exposing the full doctor catalog. */
export const renderInteractiveSetupResult = (
  result: SetupResult,
  environment: Readonly<NodeJS.ProcessEnv> = process.env,
): void => {
  const locale = cliLocale(environment);
  if (result.status === "ready") {
    const changedClients = Object.entries(result.clients)
      .filter(([, client]) => client.status === "configured")
      .map(([client]) => clientDisplayNames.get(client) ?? client);
    const readyClients = readyAgentClients(result, changedClients);
    renderReadyCapabilities(result, readyClients, environment);
    outro(
      changedClients.length === 0
        ? cliText(
            locale,
            "REA is ready for local app analysis.",
            "REA 已就绪，可以开始分析本地应用。",
          )
        : cliText(
            locale,
            `Restart ${changedClients.join(", ")} to load REA.`,
            `请重启 ${changedClients.join("、")} 以加载 REA。`,
          ),
      promptStreams,
    );
    return;
  }
  if (result.status === "planned" || result.status === "cancelled") return;
  writeLine(
    `!  ${cliText(locale, "", "配置需要处理：")}${result.remediation ?? cliText(locale, "Setup needs attention.", "请查看诊断信息。")}`,
  );
  for (const resource of result.cleanup?.resources ?? [])
    writeLine(
      `   ${cliText(locale, "Pending cleanup", "待清理资源")}: ${resource}`,
    );
  outro(
    cliText(
      locale,
      `Run \`${cliInvocation(environment)} doctor\` for the remaining checks.`,
      `运行 \`${cliInvocation(environment)} doctor\` 查看剩余检查项。`,
    ),
    promptStreams,
  );
};

const selectSetupActions = async (
  actions: readonly SetupAction[],
  accessible: boolean,
  context: SetupConfirmationContext,
  locale: CliLocale,
): Promise<readonly string[] | undefined> => {
  const clientStates = context.clientStates.filter(
    ({ client }) => client.format !== "unsupported",
  );
  const initial = new Set(context.selectedClientIds);
  const selectedClientIds = accessible
    ? await selectClientsAccessibly(clientStates, initial, locale)
    : await selectClients(clientStates, initial, locale);
  if (selectedClientIds === undefined) return undefined;
  const selectedActionIds = selectedClientIds.map(
    (id) => `configure_client:${id}`,
  );
  const skill = actions.find(({ kind }) => kind === "install_skill");
  if (skill !== undefined) {
    if (selectedClientIds.length > 0) selectedActionIds.push(skill.id);
    else {
      const included = await confirm({
        ...promptStreams,
        message: cliText(
          locale,
          "Install the guided REA skill for CLI use?",
          "是否为命令行使用安装 REA 引导技能？",
        ),
        active: cliText(locale, "Yes", "是"),
        inactive: cliText(locale, "No", "否"),
        initialValue: false,
        vertical: accessible,
      });
      if (isCancel(included)) return undefined;
      if (included) selectedActionIds.push(skill.id);
    }
  }
  const hopper = actions.find(({ kind }) => kind === "install_hopper");
  if (hopper !== undefined) {
    const included = await confirm({
      ...promptStreams,
      message: cliText(
        locale,
        "Install Hopper for deep binary analysis?",
        "是否安装 Hopper 以进行深度二进制分析？",
      ),
      active: cliText(locale, "Yes", "是"),
      inactive: cliText(locale, "No", "否"),
      initialValue: false,
      vertical: accessible,
    });
    if (isCancel(included)) return undefined;
    if (included) selectedActionIds.push(hopper.id);
  }
  return selectedActionIds;
};

const clientHint = (state: SetupClientState, locale: CliLocale): string =>
  state.configured
    ? cliText(
        locale,
        "REA already configured · selected from existing configuration",
        "已配置 REA · 根据已有配置选中",
      )
    : state.status === "invalid"
      ? cliText(
          locale,
          "Existing configuration needs repair before setup",
          "需要先修复已有配置",
        )
      : state.detected
        ? cliText(
            locale,
            "Detected · choose to configure",
            "已检测到 · 可选择配置",
          )
        : cliText(
            locale,
            "Not detected · configuration is still available",
            "未检测到 · 仍可配置",
          );

const selectClients = async (
  states: readonly SetupClientState[],
  initial: ReadonlySet<string>,
  locale: CliLocale,
): Promise<readonly string[] | undefined> => {
  if (states.length === 0) return [];
  const selection = await multiselect({
    ...promptStreams,
    message: cliText(
      locale,
      "Which agents should use REA?",
      "选择要接入 REA 的 AI 助手",
    ),
    options: states.map((state) => ({
      value: state.client.name,
      label: clientDisplayNames.get(state.client.name) ?? state.client.name,
      hint: clientHint(state, locale),
    })),
    initialValues: states
      .filter(({ client }) => initial.has(client.name))
      .map(({ client }) => client.name),
    required: false,
    maxItems: Math.max(
      3,
      Math.min(states.length, (process.stderr.rows ?? 24) - 8),
    ),
    showInstructions: locale === "en",
  });
  return isCancel(selection) ? undefined : selection;
};

const selectClientsAccessibly = async (
  states: readonly SetupClientState[],
  initial: ReadonlySet<string>,
  locale: CliLocale,
): Promise<readonly string[] | undefined> => {
  const selected: string[] = [];
  for (const state of states) {
    const included = await confirm({
      ...promptStreams,
      message: cliText(
        locale,
        `Configure ${clientDisplayNames.get(state.client.name) ?? state.client.name}? ${clientHint(state, locale)}`,
        `是否配置 ${clientDisplayNames.get(state.client.name) ?? state.client.name}？${clientHint(state, locale)}`,
      ),
      active: cliText(locale, "Yes", "是"),
      inactive: cliText(locale, "No", "否"),
      initialValue: initial.has(state.client.name),
      vertical: true,
    });
    if (isCancel(included)) return undefined;
    if (included) selected.push(state.client.name);
  }
  return selected;
};

const renderDetectedSummary = (
  states: readonly SetupClientState[],
  locale: CliLocale,
): void => {
  const detected = states.filter(({ detected }) => detected);
  writeLine("│");
  writeLine(
    detected.length === 0
      ? cliText(
          locale,
          "◆  No agents detected. Choose any supported agent below.",
          "◆  未检测到助手，请从下方选择受支持的助手。",
        )
      : `◆  ${cliText(locale, "Detected", "已检测到")}: ${humanList(
          detected.map(
            ({ client }) => clientDisplayNames.get(client.name) ?? client.name,
          ),
          locale,
        )}`,
  );
};

const renderKeyboardHelp = (accessible: boolean, locale: CliLocale): void => {
  writeLine("│");
  writeLine(
    accessible
      ? cliText(
          locale,
          "│  Keys: Enter answer · Ctrl-C cancel",
          "│  操作：回车确认 · Ctrl-C 取消",
        )
      : cliText(
          locale,
          "│  Keys: ↑/↓ navigate · Space toggle · Enter confirm · Ctrl-C cancel",
          "│  操作：↑/↓ 移动 · 空格选择 · 回车确认 · Ctrl-C 取消",
        ),
  );
};

const cliInvocation = (environment: Readonly<NodeJS.ProcessEnv>): string => {
  const runner = invokingPackageRunner(environment);
  return runner === undefined ? "rea" : `${runner} rea-agents`;
};

const renderReadyCapabilities = (
  result: SetupResult,
  readyClients: readonly string[],
  environment: Readonly<NodeJS.ProcessEnv>,
): void => {
  const locale = cliLocale(environment);
  writeLine(cliText(locale, "◆  What you can do now", "◆  现在可以使用的功能"));
  const providers = readyProviders(result);
  if (providers.length > 0)
    writeLine(
      `│  ${cliText(locale, "Deep analysis", "深度分析")}: ${humanList(providers, locale)}`,
    );
  if (readyClients.length > 0)
    writeLine(
      `│  ${cliText(locale, "Agent access", "已接入助手")}: ${humanList(readyClients, locale)}`,
    );
  if (result.doctor.identity?.skill.state === "aligned")
    writeLine(
      cliText(
        locale,
        "│  Guided reverse-engineering workflows: installed",
        "│  逆向分析引导技能：已安装",
      ),
    );
  writeLine(
    `│  CLI: ${cliInvocation(environment)} ${providers.length > 0 ? "analyze /path/to/app" : "capabilities"}`,
  );
  const firstClient = readyClients[0];
  if (firstClient !== undefined)
    writeLine(
      cliText(
        locale,
        `│  Try in ${firstClient}: "Explain how a feature works in /path/to/app and show the evidence."`,
        `│  可以在 ${firstClient} 中提问：分析 /path/to/app 的指定功能，解释实现方式并展示证据。`,
      ),
    );
};

const readyAgentClients = (
  result: SetupResult,
  changedClients: readonly string[],
): readonly string[] => {
  const alignedClients = (result.doctor.identity?.registrations ?? [])
    .filter(({ state }) => state === "aligned")
    .map(({ client }) => clientDisplayNames.get(client) ?? client);
  return [...new Set([...alignedClients, ...changedClients])];
};

const readyProviders = (result: SetupResult): readonly string[] =>
  result.doctor.availableProviders.map(displayProviderId);

/** Product spellings that title case would distort. Lookup ids stay lowercase. */
const PROVIDER_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  ida: "IDA",
  jadx: "JADX",
};

const displayProviderId = (id: string): string =>
  PROVIDER_DISPLAY_NAMES[id] ??
  (id.length === 0 ? id : `${id[0]?.toUpperCase() ?? ""}${id.slice(1)}`);

const humanList = (values: readonly string[], locale: CliLocale): string => {
  if (locale === "zh-CN") return values.join("、");
  if (values.length < 2) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
};

const renderPreflight = (
  actions: readonly SetupAction[],
  locale: CliLocale,
): void => {
  writeLine("│");
  writeLine(cliText(locale, "◆  Ready to review", "◆  请检查以下修改计划"));
  for (const action of actions) {
    writeLine("│");
    const operations = {
      create: "创建",
      update: "更新",
      install: "安装",
    };
    const operation =
      locale === "zh-CN"
        ? operations[action.operation]
        : action.operation.toUpperCase();
    writeLine(`│  ${operation}  ${action.label}`);
    writeLine(`│          ${action.target}`);
    if (action.backupPath !== undefined)
      writeLine(
        `│          ${cliText(locale, "backup", "备份")}: ${action.backupPath}`,
      );
    for (const origin of action.networkOrigins ?? [])
      writeLine(
        `│          ${cliText(locale, "network", "网络来源")}: ${origin}`,
      );
    if (action.integrity !== undefined)
      writeLine(
        `│          ${cliText(locale, "integrity", "完整性校验")}: ${action.integrity}`,
      );
    for (const command of action.commands ?? [])
      writeLine(
        `│          ${cliText(locale, "command", "执行命令")}: ${command}`,
      );
    writeLine(`│          ${action.detail}`);
    if (action.external)
      writeLine(
        cliText(
          locale,
          "│          external software",
          "│          涉及外部软件",
        ),
      );
  }
  writeLine("│");
  writeLine(
    cliText(
      locale,
      "│  REA will preserve unrelated configuration and will not install or upgrade Node.js, npm, Homebrew, Java, or Ghidra.",
      "│  REA 会保留无关配置，不会安装或升级 Node.js、npm、Homebrew、Java 或 Ghidra。",
    ),
  );
};

const cancelledDecision = (locale: CliLocale): SetupConfirmationDecision => {
  cancel(
    cliText(
      locale,
      "Setup cancelled. No changes were made.",
      "已取消配置，未作任何修改。",
    ),
    promptStreams,
  );
  return {
    approved: false,
    selectedActionIds: [],
    cancelled: true,
  };
};

const writeLine = (line: string): void => {
  process.stderr.write(`${line}\n`);
};
