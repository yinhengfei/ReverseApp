import { describe, expect, it, vi } from "vitest";

import { createCli } from "./cli.js";
import { cliLocale } from "./cli/locale.js";
import {
  renderSetupDryRun,
  renderSetupProgress,
} from "./cli/interactiveSetup.js";

const capture = async (cli: ReturnType<typeof createCli>, args: string[]) => {
  let text = "";
  let code = 0;
  await cli.serve(args, {
    stdout: (chunk) => {
      text += chunk;
    },
    exit: (value) => {
      code = value;
    },
  });
  return { text, code };
};

describe("Chinese CLI presentation", () => {
  it("keeps the language local to the selected CLI, including fallback", async () => {
    const chinese = createCli({ REA_LOCALE: "zh-CN" });
    const english = createCli({ REA_LOCALE: "en" });
    const zh = await capture(chinese, ["inspect-managed-members", "--help"]);
    const en = await capture(english, ["inspect-managed-members", "--help"]);
    expect(zh.code).toBe(0);
    expect(zh.text).toContain("检查 .NET 类型");
    expect(zh.text).toContain("托管 PE 可执行文件或 .NET 程序集路径");
    expect(zh.text).toContain("必须同时指定 --evidence-bundle");
    expect(en.text).toContain("Managed PE executable or assembly path");
    expect(en.text).not.toContain("检查 .NET 类型");
    expect(cliLocale({})).toBe("en");
    expect(cliLocale({ REA_LOCALE: "fr" })).toBe("en");
    expect(cliLocale({ REA_LOCALE: "zh_CN" })).toBe("zh-CN");
  });

  it("retains command/option names and setup approval descriptions", async () => {
    const cli = createCli({ REA_LOCALE: "zh-CN" });
    const result = await capture(cli, ["setup", "--help"]);
    expect(result.text).toContain("配置 AI 助手集成");
    expect(result.text).toContain("--dry-run");
    expect(result.text).toContain("只显示配置计划，不执行修改");
    expect(result.text).toContain("配合 --yes 同时批准安装 Hopper");
    expect(result.text).toContain("--client");
  });

  it("does not translate machine-readable validation or caller-supplied values", async () => {
    const args = ["inspect-managed-members", "", "--json"];
    const zh = await capture(createCli({ REA_LOCALE: "zh-CN" }), args);
    const en = await capture(createCli({ REA_LOCALE: "en" }), args);
    expect(zh.code).toBe(en.code);
    expect(zh.code).not.toBe(0);
    expect(JSON.parse(zh.text)).toEqual(JSON.parse(en.text));
  });

  it("preserves exact plan evidence while localizing human labels", () => {
    let text = "";
    const write = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk) => {
        text += String(chunk);
        return true;
      });
    try {
      renderSetupDryRun(
        [
          {
            id: "configure_client:codex",
            kind: "configure_client",
            operation: "create",
            label: "Codex",
            target: "E:\\用户资料\\Do not translate\\config.toml",
            detail: "Keep this producer detail verbatim.",
            external: false,
            backupPath: "E:\\用户资料\\config.toml.backup",
            commands: ['node "E:\\REA\\scripts\\rea.mjs" mcp'],
          },
        ],
        "zh-CN",
      );
      renderSetupProgress(
        {
          actionId: "configure_client:codex",
          label: "Codex",
          state: "completed",
        },
        "zh-CN",
      );
      expect(text).toContain("请检查以下修改计划");
      expect(text).toContain("备份: E:\\用户资料\\config.toml.backup");
      expect(text).toContain('node "E:\\REA\\scripts\\rea.mjs" mcp');
      expect(text).toContain("E:\\用户资料\\Do not translate\\config.toml");
      expect(text).toContain("Keep this producer detail verbatim.");
      expect(text).toContain("已完成：Codex");
      expect(text).toContain("计划预览完成，未作任何修改。");
    } finally {
      write.mockRestore();
    }
  });
});
