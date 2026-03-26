import { fileURLToPath } from "node:url";

import { execa } from "execa";
import { describe, expect, it } from "vitest";

const cliPath = fileURLToPath(new URL("../src/index.ts", import.meta.url));

const runCli = async (args: readonly string[]) => {
  return execa(process.execPath, [cliPath, ...args], {
    env: {
      FORCE_COLOR: "0",
      NODE_NO_WARNINGS: "1",
      NO_COLOR: "1",
    },
  });
};

describe("autocomplete commands", () => {
  it("appears in root help", async () => {
    const result = await runCli([]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("autocomplete");
    expect(result.stdout).toContain("Manage shell autocomplete support");
    expect(result.stdout).not.toContain("Configuration sync utilities");
  });

  it("shows help for autocomplete install and uninstall", async () => {
    const helpResult = await runCli(["autocomplete", "--help"]);
    const installResult = await runCli(["autocomplete", "install", "--help"]);
    const uninstallResult = await runCli([
      "autocomplete",
      "uninstall",
      "--help",
    ]);

    expect(helpResult.exitCode).toBe(0);
    expect(helpResult.stderr).toBe("");
    expect(helpResult.stdout).toContain("devtools autocomplete install");
    expect(helpResult.stdout).toContain("devtools autocomplete uninstall");

    expect(installResult.exitCode).toBe(0);
    expect(installResult.stderr).toBe("");
    expect(installResult.stdout).toContain(
      "Installs bash autocomplete support for devtools",
    );

    expect(uninstallResult.exitCode).toBe(0);
    expect(uninstallResult.stderr).toBe("");
    expect(uninstallResult.stdout).toContain(
      "Uninstalls bash autocomplete support for devtools",
    );
  });
});
