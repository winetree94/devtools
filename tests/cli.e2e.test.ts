import { lstat, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { execa } from "execa";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupportedSkillInstallAgent } from "#app/services/skills/agents.ts";
import packageJson from "../package.json" with { type: "json" };
import { cliPath, ensureCliBuilt } from "../src/test/helpers/cli-entry.ts";
import {
  startWebFixtureServer,
  type WebFixtureServer,
} from "../src/test/helpers/web-fixture-server.ts";

const bundledSkillsDirectory = fileURLToPath(
  new URL("../skills", import.meta.url),
);
const defaultTargetDirectories = {
  common: [".agents", "skills"],
  claude: [".claude", "skills"],
  opencode: [".config", "opencode", "skills"],
  copilot: [".copilot", "skills"],
} satisfies Record<SupportedSkillInstallAgent, readonly string[]>;

let bundledSkillNames: string[];
let webFixtureServer: WebFixtureServer;

beforeAll(async () => {
  await ensureCliBuilt();

  const bundledSkillDirectories = await readdir(bundledSkillsDirectory, {
    withFileTypes: true,
  });

  bundledSkillNames = bundledSkillDirectories
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => {
      return left.localeCompare(right);
    });
  webFixtureServer = await startWebFixtureServer();
});

afterAll(async () => {
  await webFixtureServer.close();
});

const runCli = async (
  args: readonly string[],
  options?: Readonly<{
    env?: NodeJS.ProcessEnv;
    input?: string;
    reject?: boolean;
  }>,
) => {
  const execaOptions: {
    env?: NodeJS.ProcessEnv;
    input?: string;
    reject?: boolean;
  } = {};

  if (options?.env !== undefined) {
    execaOptions.env = options.env;
  }

  if (options?.input !== undefined) {
    execaOptions.input = options.input;
  }

  if (options?.reject !== undefined) {
    execaOptions.reject = options.reject;
  }

  return execa(process.execPath, [cliPath, ...args], execaOptions);
};

describe("CLI integration", () => {
  it("shows the version from the real entrypoint", async () => {
    const result = await runCli(["--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`devtools/${packageJson.version}`);
    expect(result.stderr).toBe("");
  });

  it("shows help for install, uninstall, and nested web commands", async () => {
    const installHelpResult = await runCli(["install", "skills", "--help"]);
    const uninstallHelpResult = await runCli(["uninstall", "skills", "--help"]);
    const webHelpResult = await runCli(["web", "--help"]);
    const crawlHelpResult = await runCli(["web", "crawl", "--help"]);
    const docsFetchHelpResult = await runCli(["web", "docs-fetch", "--help"]);
    const searchHelpResult = await runCli(["web", "search", "--help"]);
    const fetchHelpResult = await runCli(["web", "fetch", "--help"]);
    const inspectHelpResult = await runCli(["web", "inspect", "--help"]);
    const linksHelpResult = await runCli(["web", "links", "--help"]);
    const sitemapHelpResult = await runCli(["web", "sitemap", "--help"]);

    expect(installHelpResult.exitCode).toBe(0);
    expect(installHelpResult.stdout).toContain("devtools install skills");
    expect(installHelpResult.stdout).toContain("--dry-run");
    expect(installHelpResult.stdout).toContain("--target-dir");
    expect(uninstallHelpResult.exitCode).toBe(0);
    expect(uninstallHelpResult.stdout).toContain("devtools uninstall skills");
    expect(uninstallHelpResult.stdout).toContain("--dry-run");
    expect(uninstallHelpResult.stdout).toContain("--target-dir");

    expect(webHelpResult.exitCode).toBe(0);
    expect(webHelpResult.stdout).toContain("Web utilities");
    expect(webHelpResult.stdout).toContain("crawl");
    expect(webHelpResult.stdout).toContain("docs-fetch");
    expect(webHelpResult.stdout).toContain("docs-search");
    expect(webHelpResult.stdout).toContain("fetch");
    expect(webHelpResult.stdout).toContain("inspect");
    expect(webHelpResult.stdout).toContain("links");
    expect(webHelpResult.stdout).toContain("search");
    expect(webHelpResult.stdout).toContain("sitemap");
    expect(crawlHelpResult.exitCode).toBe(0);
    expect(crawlHelpResult.stdout).toContain("devtools web crawl");
    expect(crawlHelpResult.stdout).toContain("--max-depth");
    expect(docsFetchHelpResult.exitCode).toBe(0);
    expect(docsFetchHelpResult.stdout).toContain("devtools web docs-fetch");
    expect(docsFetchHelpResult.stdout).toContain("--format");
    expect(searchHelpResult.exitCode).toBe(0);
    expect(searchHelpResult.stdout).toContain("devtools web search");
    expect(searchHelpResult.stdout).toContain("--site");
    expect(fetchHelpResult.exitCode).toBe(0);
    expect(fetchHelpResult.stdout).toContain("devtools web fetch");
    expect(fetchHelpResult.stdout).toContain("--format");
    expect(inspectHelpResult.exitCode).toBe(0);
    expect(inspectHelpResult.stdout).toContain("devtools web inspect");
    expect(inspectHelpResult.stdout).toContain("--json");
    expect(linksHelpResult.exitCode).toBe(0);
    expect(linksHelpResult.stdout).toContain("devtools web links");
    expect(linksHelpResult.stdout).toContain("--same-origin");
    expect(sitemapHelpResult.exitCode).toBe(0);
    expect(sitemapHelpResult.stdout).toContain("devtools web sitemap");
    expect(sitemapHelpResult.stdout).toContain("--same-origin");
  }, 15_000);

  it("installs bundled common skills into a target directory", async () => {
    const targetDirectory = await mkdtemp(join(tmpdir(), "devtools-skills-"));

    try {
      const result = await runCli([
        "install",
        "skills",
        "common",
        "--target-dir",
        targetDirectory,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(
        `Installed ${bundledSkillNames.length} skills for common.`,
      );
      expect(result.stderr).toBe("");

      const entries = (await readdir(targetDirectory)).sort((left, right) => {
        return left.localeCompare(right);
      });

      expect(entries).toEqual(bundledSkillNames);

      for (const skillName of bundledSkillNames) {
        const skillLinkPath = join(targetDirectory, skillName);
        const linkStats = await lstat(skillLinkPath);

        expect(linkStats.isDirectory()).toBe(true);
        expect(linkStats.isSymbolicLink()).toBe(false);
      }

      expect(
        await readFile(
          join(targetDirectory, "web-research", "SKILL.md"),
          "utf8",
        ),
      ).toContain("name: web-research");
      expect(
        await readFile(
          join(targetDirectory, "web-research", "references", "commands.md"),
          "utf8",
        ),
      ).toContain("Web Command Reference");
      expect(
        await readFile(
          join(targetDirectory, "verification-before-completion", "SKILL.md"),
          "utf8",
        ),
      ).toContain("name: verification-before-completion");
      expect(
        await readFile(
          join(
            targetDirectory,
            "verification-before-completion",
            "references",
            "completion-report-checklist.md",
          ),
          "utf8",
        ),
      ).toContain("Completion Report Checklist");
    } finally {
      await rm(targetDirectory, { force: true, recursive: true });
    }
  });

  it.each(
    Object.entries(defaultTargetDirectories) as Array<
      [SupportedSkillInstallAgent, readonly string[]]
    >,
  )("installs and uninstalls bundled %s skills in the default user-global directory", async (agent, targetSegments) => {
    const homeDirectory = await mkdtemp(
      join(tmpdir(), `devtools-home-${agent}-`),
    );
    const expectedTargetDirectory = join(homeDirectory, ...targetSegments);

    try {
      const installResult = await runCli(["install", "skills", agent], {
        env: {
          HOME: homeDirectory,
        },
      });

      expect(installResult.exitCode).toBe(0);
      expect(installResult.stdout).toContain(
        `Installed ${bundledSkillNames.length} skills for ${agent}.`,
      );
      expect(installResult.stdout).toContain(
        `Target directory: ${expectedTargetDirectory}`,
      );

      for (const skillName of bundledSkillNames) {
        const installedPath = join(expectedTargetDirectory, skillName);
        const installedStats = await lstat(installedPath);

        expect(installedStats.isDirectory()).toBe(true);
        expect(installedStats.isSymbolicLink()).toBe(false);
      }

      const uninstallResult = await runCli(["uninstall", "skills", agent], {
        env: {
          HOME: homeDirectory,
        },
      });

      expect(uninstallResult.exitCode).toBe(0);
      expect(uninstallResult.stdout).toContain(
        `Removed ${bundledSkillNames.length} skills for ${agent}.`,
      );

      for (const skillName of bundledSkillNames) {
        await expect(
          lstat(join(expectedTargetDirectory, skillName)),
        ).rejects.toMatchObject({
          code: "ENOENT",
        });
      }
    } finally {
      await rm(homeDirectory, { force: true, recursive: true });
    }
  });

  it("supports dry-run skill installation without creating files", async () => {
    const workspaceDirectory = await mkdtemp(
      join(tmpdir(), "devtools-dry-run-"),
    );
    const targetDirectory = join(workspaceDirectory, "skills-target");

    try {
      const result = await runCli([
        "install",
        "skills",
        "common",
        "--target-dir",
        targetDirectory,
        "--dry-run",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(
        `Dry run for common: ${bundledSkillNames.length} skills evaluated.`,
      );
      expect(result.stdout).toContain("No filesystem changes were made.");
      await expect(lstat(targetDirectory)).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(workspaceDirectory, { force: true, recursive: true });
    }
  });

  it("uninstalls bundled common skills from a target directory", async () => {
    const targetDirectory = await mkdtemp(join(tmpdir(), "devtools-remove-"));

    try {
      await runCli([
        "install",
        "skills",
        "common",
        "--target-dir",
        targetDirectory,
      ]);

      const result = await runCli([
        "uninstall",
        "skills",
        "common",
        "--target-dir",
        targetDirectory,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(
        `Removed ${bundledSkillNames.length} skills for common.`,
      );

      for (const skillName of bundledSkillNames) {
        await expect(
          lstat(join(targetDirectory, skillName)),
        ).rejects.toMatchObject({
          code: "ENOENT",
        });
      }
    } finally {
      await rm(targetDirectory, { force: true, recursive: true });
    }
  });

  it("supports dry-run skill uninstallation without removing files", async () => {
    const targetDirectory = await mkdtemp(
      join(tmpdir(), "devtools-remove-dry-"),
    );

    try {
      await runCli([
        "install",
        "skills",
        "common",
        "--target-dir",
        targetDirectory,
      ]);

      const result = await runCli([
        "uninstall",
        "skills",
        "common",
        "--target-dir",
        targetDirectory,
        "--dry-run",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(
        `Dry run for common uninstall: ${bundledSkillNames.length} skills evaluated.`,
      );

      for (const skillName of bundledSkillNames) {
        const installedPath = join(targetDirectory, skillName);
        const installedStats = await lstat(installedPath);

        expect(installedStats.isDirectory()).toBe(true);
        expect(installedStats.isSymbolicLink()).toBe(false);
      }
    } finally {
      await rm(targetDirectory, { force: true, recursive: true });
    }
  });

  it("shows a helpful error when the brave api key is missing", async () => {
    const result = await runCli(
      ["web", "search", "--engine", "brave", "typescript"],
      {
        env: {
          BRAVE_SEARCH_API_KEY: "",
        },
        reject: false,
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("BRAVE_SEARCH_API_KEY is required");
    expect(result.stderr).toContain("brave search");
  });

  it("shows a validation error for an invalid search limit", async () => {
    const result = await runCli(
      ["web", "search", "typescript", "--limit", "0"],
      {
        reject: false,
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "- options.limit: Limit must be greater than 0.",
    );
  });

  it("rejects unsupported skill install agents", async () => {
    const result = await runCli(["install", "skills", "gemini"], {
      reject: false,
    });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("gemini");
    expect(result.stderr).toContain("common");
  });

  it("rejects install skills with no agent and no --all flag", async () => {
    const result = await runCli(["install", "skills"], { reject: false });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--all");
  });

  it("rejects --all combined with --target-dir for install", async () => {
    const result = await runCli(
      ["install", "skills", "--all", "--target-dir", "/tmp/test"],
      { reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--all");
    expect(result.stderr).toContain("--target-dir");
  });

  it("rejects --all combined with a specific agent for install", async () => {
    const result = await runCli(["install", "skills", "--all", "common"], {
      reject: false,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--all");
  });

  it("installs bundled skills for all agents with --all", async () => {
    const homeDirectory = await mkdtemp(
      join(tmpdir(), "devtools-all-install-"),
    );

    try {
      const result = await runCli(["install", "skills", "--all"], {
        env: { HOME: homeDirectory },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");

      for (const [agent, targetSegments] of Object.entries(
        defaultTargetDirectories,
      )) {
        expect(result.stdout).toContain(
          `Installed ${bundledSkillNames.length} skills for ${agent}.`,
        );

        const targetDirectory = join(homeDirectory, ...targetSegments);

        for (const skillName of bundledSkillNames) {
          const installedStats = await lstat(join(targetDirectory, skillName));
          expect(installedStats.isDirectory()).toBe(true);
        }
      }
    } finally {
      await rm(homeDirectory, { force: true, recursive: true });
    }
  });

  it("supports dry-run --all installation without creating files", async () => {
    const homeDirectory = await mkdtemp(
      join(tmpdir(), "devtools-all-dry-run-"),
    );

    try {
      const result = await runCli(["install", "skills", "--all", "--dry-run"], {
        env: { HOME: homeDirectory },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");

      for (const agent of Object.keys(defaultTargetDirectories)) {
        expect(result.stdout).toContain(
          `Dry run for ${agent}: ${bundledSkillNames.length} skills evaluated.`,
        );
      }

      for (const targetSegments of Object.values(defaultTargetDirectories)) {
        await expect(
          lstat(join(homeDirectory, ...targetSegments)),
        ).rejects.toMatchObject({ code: "ENOENT" });
      }
    } finally {
      await rm(homeDirectory, { force: true, recursive: true });
    }
  });

  it("uninstalls bundled skills for all agents with --all", async () => {
    const homeDirectory = await mkdtemp(
      join(tmpdir(), "devtools-all-uninstall-"),
    );

    try {
      await runCli(["install", "skills", "--all"], {
        env: { HOME: homeDirectory },
      });

      const result = await runCli(["uninstall", "skills", "--all"], {
        env: { HOME: homeDirectory },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");

      for (const [agent, targetSegments] of Object.entries(
        defaultTargetDirectories,
      )) {
        expect(result.stdout).toContain(
          `Removed ${bundledSkillNames.length} skills for ${agent}.`,
        );

        const targetDirectory = join(homeDirectory, ...targetSegments);

        for (const skillName of bundledSkillNames) {
          await expect(
            lstat(join(targetDirectory, skillName)),
          ).rejects.toMatchObject({ code: "ENOENT" });
        }
      }
    } finally {
      await rm(homeDirectory, { force: true, recursive: true });
    }
  });

  it("fetches a local fixture page as markdown", async () => {
    const result = await runCli([
      "web",
      "fetch",
      `${webFixtureServer.baseUrl}/article`,
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Primary heading");
    expect(result.stdout).toContain("Alpha paragraph.");
    expect(result.stderr).toBe("");
  });

  it("fetches a local fixture page as json", async () => {
    const result = await runCli([
      "web",
      "fetch",
      `${webFixtureServer.baseUrl}/article`,
      "--format",
      "json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      finalUrl: `${webFixtureServer.baseUrl}/article`,
      canonicalUrl: `${webFixtureServer.baseUrl}/article`,
      title: "Fixture OG Title",
      markdown: expect.stringContaining("Primary heading"),
    });
    expect(result.stderr).toBe("");
  });

  it("inspects a local fixture page as json", async () => {
    const result = await runCli([
      "web",
      "inspect",
      `${webFixtureServer.baseUrl}/article`,
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      finalUrl: `${webFixtureServer.baseUrl}/article`,
      canonicalUrl: `${webFixtureServer.baseUrl}/article`,
      title: "Fixture Article",
      description: "Fixture description",
      language: "en",
    });
    expect(result.stderr).toBe("");
  });

  it("extracts normalized links from a local fixture page", async () => {
    const result = await runCli([
      "web",
      "links",
      `${webFixtureServer.baseUrl}/article`,
      "--same-origin",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      finalUrl: `${webFixtureServer.baseUrl}/article`,
      sameOriginOnly: true,
      links: expect.arrayContaining([
        expect.objectContaining({
          kind: "same-origin",
          url: `${webFixtureServer.baseUrl}/docs`,
          occurrences: 2,
        }),
      ]),
    });
    expect(result.stderr).toBe("");
  });

  it("reads sitemap urls from a local fixture site", async () => {
    const result = await runCli([
      "web",
      "sitemap",
      webFixtureServer.baseUrl,
      "--same-origin",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      requestedUrl: `${webFixtureServer.baseUrl}/`,
      sameOriginOnly: true,
      sitemapUrls: [
        `${webFixtureServer.baseUrl}/sitemap-docs.xml`,
        `${webFixtureServer.baseUrl}/sitemap.xml`,
      ],
      urls: expect.arrayContaining([
        expect.objectContaining({ url: `${webFixtureServer.baseUrl}/` }),
        expect.objectContaining({ url: `${webFixtureServer.baseUrl}/article` }),
        expect.objectContaining({
          url: `${webFixtureServer.baseUrl}/docs/reference`,
        }),
      ]),
    });
    expect(result.stderr).toBe("");
  });

  it("fetches a structured docs page as json", async () => {
    const result = await runCli([
      "web",
      "docs-fetch",
      `${webFixtureServer.baseUrl}/docs/reference`,
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      canonicalUrl: `${webFixtureServer.baseUrl}/docs/reference`,
      contentRoot: {
        selector: "main",
        strategy: "main",
      },
      title: "Fixture Docs OG Title",
    });
    expect(result.stderr).toBe("");
  });

  it("crawls a local fixture site as json", async () => {
    const result = await runCli([
      "web",
      "crawl",
      webFixtureServer.baseUrl,
      "--same-origin",
      "--max-depth",
      "2",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      requestedUrl: `${webFixtureServer.baseUrl}/`,
      sameOriginOnly: true,
      pages: expect.arrayContaining([
        expect.objectContaining({ finalUrl: `${webFixtureServer.baseUrl}/` }),
        expect.objectContaining({
          finalUrl: `${webFixtureServer.baseUrl}/docs`,
        }),
      ]),
    });
    expect(result.stderr).toBe("");
  });

  it("rejects --json with batch inspect input", async () => {
    const result = await runCli(["web", "inspect", "--stdin", "--json"], {
      input: `${webFixtureServer.baseUrl}/article\n`,
      reject: false,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Use --batch-output jsonl");
  });

  it("shows a validation error for an invalid fetch url", async () => {
    const result = await runCli(["web", "fetch", "not-a-url"], {
      reject: false,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("- url: URL must be a valid absolute URL.");
  });

  it("returns a non-zero exit code for an unknown command", async () => {
    const result = await runCli(["unknown"], {
      reject: false,
    });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain('Command "unknown" not found.');
  });

  it("returns a non-zero exit code for removed sync commands", async () => {
    const [topicResult, subcommandResult] = await Promise.all([
      runCli(["sync"], {
        reject: false,
      }),
      runCli(["sync", "init"], {
        reject: false,
      }),
    ]);

    expect(topicResult.exitCode).toBe(2);
    expect(topicResult.stdout).toBe("");
    expect(topicResult.stderr).toContain('Command "sync" not found.');

    expect(subcommandResult.exitCode).toBe(2);
    expect(subcommandResult.stdout).toBe("");
    expect(subcommandResult.stderr).toContain('Command "sync" not found.');
  });
});
