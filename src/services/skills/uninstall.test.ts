import {
  lstat,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { supportedSkillInstallAgents } from "#app/services/skills/agents.ts";
import {
  createSkillUninstaller,
  formatSkillUninstallResult,
  runUninstallSkillsCommand,
  SkillUninstallError,
} from "#app/services/skills/install.ts";

const temporaryDirectories: string[] = [];

const createTemporaryDirectory = async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "devtools-skill-remove-test-"),
  );

  temporaryDirectories.push(directory);

  return directory;
};

const createSkillDirectory = async (skillsDirectory: string, name: string) => {
  const skillDirectory = join(skillsDirectory, name);

  await mkdir(skillDirectory, { recursive: true });
  await writeFile(
    join(skillDirectory, "SKILL.md"),
    [
      "---",
      `name: ${name}`,
      `description: ${name} description.`,
      "---",
      "",
      `# ${name}`,
      "",
    ].join("\n"),
  );

  return skillDirectory;
};

afterEach(async () => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();

    if (directory !== undefined) {
      await rm(directory, { force: true, recursive: true });
    }
  }
});

describe("formatSkillUninstallResult", () => {
  it("formats a readable removal summary", () => {
    const output = formatSkillUninstallResult({
      agent: "common",
      dryRun: false,
      skillsDirectory: "/repo/skills",
      targetDirectory: "/home/example/.agents/skills",
      uninstalledSkills: [
        {
          name: "web-research",
          sourcePath: "/repo/skills/web-research",
          targetPath: "/home/example/.agents/skills/web-research",
          status: "removed",
        },
      ],
    });

    expect(output).toContain("Removed 1 skills for common.");
    expect(output).toContain("Summary: 1 removed, 0 skipped.");
    expect(output).toContain("- web-research: removed ->");
  });

  it("formats a dry-run removal summary", () => {
    const output = formatSkillUninstallResult({
      agent: "common",
      dryRun: true,
      skillsDirectory: "/repo/skills",
      targetDirectory: "/home/example/.agents/skills",
      uninstalledSkills: [
        {
          name: "web-research",
          sourcePath: "/repo/skills/web-research",
          targetPath: "/home/example/.agents/skills/web-research",
          status: "would-remove",
        },
      ],
    });

    expect(output).toContain(
      "Dry run for common uninstall: 1 skills evaluated.",
    );
    expect(output).toContain("Summary: 1 would remove, 0 skipped.");
    expect(output).toContain("No filesystem changes were made.");
  });
});

describe("runUninstallSkillsCommand", () => {
  it("maps validated input to the uninstaller and formats the result", async () => {
    const requests: Array<{
      agent: (typeof supportedSkillInstallAgents)[number];
      dryRun: boolean;
      targetDirectory?: string;
    }> = [];

    const output = await runUninstallSkillsCommand(
      {
        agent: "common",
        options: {
          dryRun: true,
          targetDir: "/tmp/common-skills",
        },
      },
      {
        skillUninstaller: {
          uninstall: async (request) => {
            requests.push(request);

            return {
              agent: request.agent,
              dryRun: request.dryRun,
              skillsDirectory: "/repo/skills",
              targetDirectory: request.targetDirectory ?? "/tmp/common-skills",
              uninstalledSkills: [
                {
                  name: "web-research",
                  sourcePath: "/repo/skills/web-research",
                  targetPath: "/tmp/common-skills/web-research",
                  status: request.dryRun ? "would-remove" : "removed",
                },
              ],
            };
          },
        },
      },
    );

    expect(output).toContain(
      "Dry run for common uninstall: 1 skills evaluated.",
    );
    expect(requests).toEqual([
      {
        agent: "common",
        dryRun: true,
        targetDirectory: "/tmp/common-skills",
      },
    ]);
  });
});

describe("createSkillUninstaller", () => {
  it.each(
    supportedSkillInstallAgents,
  )("removes managed %s skill directory copies", async (agent) => {
    const workspaceDirectory = await createTemporaryDirectory();
    const skillsDirectory = join(workspaceDirectory, "skills");
    const targetDirectory = join(workspaceDirectory, "target");
    const skillDirectory = await createSkillDirectory(
      skillsDirectory,
      "web-research",
    );

    await mkdir(join(targetDirectory, "web-research"), { recursive: true });
    await writeFile(
      join(targetDirectory, "web-research", "SKILL.md"),
      "# web-research",
    );

    const uninstaller = createSkillUninstaller({ skillsDirectory });
    const result = await uninstaller.uninstall({
      agent,
      dryRun: false,
      targetDirectory,
    });

    expect(result.uninstalledSkills).toEqual([
      {
        name: "web-research",
        sourcePath: skillDirectory,
        targetPath: join(targetDirectory, "web-research"),
        status: "removed",
      },
    ]);
    await expect(
      lstat(join(targetDirectory, "web-research")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it.each(
    supportedSkillInstallAgents,
  )("removes managed %s skill symlinks (backward compat)", async (agent) => {
    const workspaceDirectory = await createTemporaryDirectory();
    const skillsDirectory = join(workspaceDirectory, "skills");
    const targetDirectory = join(workspaceDirectory, "target");
    const skillDirectory = await createSkillDirectory(
      skillsDirectory,
      "web-research",
    );

    await mkdir(targetDirectory, { recursive: true });
    await symlink(skillDirectory, join(targetDirectory, "web-research"), "dir");

    const uninstaller = createSkillUninstaller({ skillsDirectory });
    const result = await uninstaller.uninstall({
      agent,
      dryRun: false,
      targetDirectory,
    });

    expect(result.uninstalledSkills).toEqual([
      {
        name: "web-research",
        sourcePath: skillDirectory,
        targetPath: join(targetDirectory, "web-research"),
        status: "removed",
      },
    ]);
    await expect(
      lstat(join(targetDirectory, "web-research")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it.each(
    supportedSkillInstallAgents,
  )("supports dry-run %s removal of directory copies without deleting files", async (agent) => {
    const workspaceDirectory = await createTemporaryDirectory();
    const skillsDirectory = join(workspaceDirectory, "skills");
    const targetDirectory = join(workspaceDirectory, "target");

    await createSkillDirectory(skillsDirectory, "web-research");
    await mkdir(join(targetDirectory, "web-research"), { recursive: true });
    await writeFile(
      join(targetDirectory, "web-research", "SKILL.md"),
      "# web-research",
    );

    const uninstaller = createSkillUninstaller({ skillsDirectory });
    const result = await uninstaller.uninstall({
      agent,
      dryRun: true,
      targetDirectory,
    });

    expect(result.uninstalledSkills[0]).toMatchObject({
      name: "web-research",
      status: "would-remove",
    });
    const dirStats = await lstat(join(targetDirectory, "web-research"));
    expect(dirStats.isDirectory()).toBe(true);
  });

  it.each(
    supportedSkillInstallAgents,
  )("supports dry-run %s removal without deleting files (backward compat)", async (agent) => {
    const workspaceDirectory = await createTemporaryDirectory();
    const skillsDirectory = join(workspaceDirectory, "skills");
    const targetDirectory = join(workspaceDirectory, "target");
    const skillDirectory = await createSkillDirectory(
      skillsDirectory,
      "web-research",
    );

    await mkdir(targetDirectory, { recursive: true });
    await symlink(skillDirectory, join(targetDirectory, "web-research"), "dir");

    const uninstaller = createSkillUninstaller({ skillsDirectory });
    const result = await uninstaller.uninstall({
      agent,
      dryRun: true,
      targetDirectory,
    });

    expect(result.uninstalledSkills[0]).toMatchObject({
      name: "web-research",
      status: "would-remove",
    });
    const linkStats = await lstat(join(targetDirectory, "web-research"));
    expect(linkStats.isSymbolicLink()).toBe(true);
  });

  it("skips missing targets", async () => {
    const workspaceDirectory = await createTemporaryDirectory();
    const skillsDirectory = join(workspaceDirectory, "skills");

    await createSkillDirectory(skillsDirectory, "web-research");

    const uninstaller = createSkillUninstaller({ skillsDirectory });
    const result = await uninstaller.uninstall({
      agent: "common",
      dryRun: false,
      targetDirectory: join(workspaceDirectory, "target"),
    });

    expect(result.uninstalledSkills[0]).toMatchObject({
      name: "web-research",
      status: "skipped",
    });
  });

  it("rejects unrelated symlinks and non-symlink targets", async () => {
    const workspaceDirectory = await createTemporaryDirectory();
    const skillsDirectory = join(workspaceDirectory, "skills");
    const otherSkillsDirectory = join(workspaceDirectory, "other-skills");
    const targetDirectory = join(workspaceDirectory, "target");
    const otherSkillDirectory = await createSkillDirectory(
      otherSkillsDirectory,
      "web-research",
    );

    await createSkillDirectory(skillsDirectory, "web-research");
    await mkdir(targetDirectory, { recursive: true });
    await symlink(
      otherSkillDirectory,
      join(targetDirectory, "web-research"),
      "dir",
    );

    const uninstaller = createSkillUninstaller({ skillsDirectory });

    await expect(
      uninstaller.uninstall({
        agent: "common",
        dryRun: false,
        targetDirectory,
      }),
    ).rejects.toThrowError(
      `Skill target does not point to the bundled skill: ${join(targetDirectory, "web-research")}`,
    );

    await rm(join(targetDirectory, "web-research"), {
      force: true,
      recursive: true,
    });
    await mkdir(join(targetDirectory, "web-research"), { recursive: true });

    await expect(
      uninstaller.uninstall({
        agent: "common",
        dryRun: false,
        targetDirectory,
      }),
    ).rejects.toThrowError(
      `Skill target is not a managed skill directory: ${join(targetDirectory, "web-research")}`,
    );
  });

  it("throws when the skills directory is missing or empty", async () => {
    const workspaceDirectory = await createTemporaryDirectory();
    const missingSkillsDirectory = join(workspaceDirectory, "missing-skills");
    const emptySkillsDirectory = join(workspaceDirectory, "empty-skills");

    await mkdir(emptySkillsDirectory, { recursive: true });

    await expect(
      createSkillUninstaller({
        skillsDirectory: missingSkillsDirectory,
      }).uninstall({
        agent: "common",
        dryRun: false,
        targetDirectory: join(workspaceDirectory, "target-a"),
      }),
    ).rejects.toBeInstanceOf(SkillUninstallError);

    await expect(
      createSkillUninstaller({
        skillsDirectory: emptySkillsDirectory,
      }).uninstall({
        agent: "common",
        dryRun: false,
        targetDirectory: join(workspaceDirectory, "target-b"),
      }),
    ).rejects.toThrowError(
      `No installable skills found in ${emptySkillsDirectory}.`,
    );
  });
});
