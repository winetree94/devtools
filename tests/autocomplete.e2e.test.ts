import { execa } from "execa";
import { beforeAll, describe, expect, it } from "vitest";

import { cliPath, ensureCliBuilt } from "../src/test/helpers/cli-entry.js";

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
  beforeAll(async () => {
    await ensureCliBuilt();
  });

  it("appears in root help", async () => {
    const result = await runCli([]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("autocomplete");
    expect(result.stdout).toContain("Print shell autocomplete scripts");
    expect(result.stdout).not.toContain("Configuration sync utilities");
  });

  it("shows help for autocomplete bash, zsh, and powershell", async () => {
    const helpResult = await runCli(["autocomplete", "--help"]);
    const bashResult = await runCli(["autocomplete", "bash", "--help"]);
    const zshResult = await runCli(["autocomplete", "zsh", "--help"]);
    const powershellResult = await runCli([
      "autocomplete",
      "powershell",
      "--help",
    ]);

    expect(helpResult.exitCode).toBe(0);
    expect(helpResult.stderr).toBe("");
    expect(helpResult.stdout).toContain("devtools autocomplete bash");
    expect(helpResult.stdout).toContain("devtools autocomplete zsh");
    expect(helpResult.stdout).toContain("devtools autocomplete powershell");

    expect(bashResult.exitCode).toBe(0);
    expect(bashResult.stderr).toBe("");
    expect(bashResult.stdout).toContain(
      'Emit a bash autocomplete script for use with `eval "$(devtools autocomplete bash)"`.',
    );

    expect(zshResult.exitCode).toBe(0);
    expect(zshResult.stderr).toBe("");
    expect(zshResult.stdout).toContain(
      'Emit a zsh autocomplete script for use with `eval "$(devtools autocomplete zsh)"`.',
    );

    expect(powershellResult.exitCode).toBe(0);
    expect(powershellResult.stderr).toBe("");
    expect(powershellResult.stdout).toContain(
      'Emit a powershell autocomplete script for use with `eval "$(devtools autocomplete powershell)"`.',
    );
  });

  it("prints a bash completion script", async () => {
    const result = await runCli(["autocomplete", "bash"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("__devtools_complete");
    expect(result.stdout).toContain("devtools __complete");
  });
});
