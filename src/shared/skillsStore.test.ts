import { scanSkills } from "./skillsStore";

describe("skillsStore", () => {
  it("discovers the first existing brand directory by default", async () => {
    const files = createMemorySkillFs({
      "~/.claude/skills/writer/SKILL.md": `---
name: writer
description: Writing helper
---
# Writer
`,
      "~/.codex/skills/reviewer/SKILL.md": `---
name: reviewer
description: Review helper
---
# Reviewer
`,
    });

    const report = await scanSkills(files, {
      mergeAllAvailableSkills: false,
    });

    expect(report.discoveryMode).toBe("auto");
    expect(report.paths.find((entry) => entry.id === "user-brand-claude")?.selected).toBe(true);
    expect(report.paths.find((entry) => entry.id === "user-brand-codex")?.selected).toBe(false);
    expect(report.skills.map((skill) => skill.name)).toEqual(["writer", "reviewer"]);
    expect(report.skills.find((skill) => skill.name === "writer")?.enabled).toBe(true);
    expect(report.skills.find((skill) => skill.name === "reviewer")?.enabled).toBe(false);
  });

  it("merges all available brand directories when enabled", async () => {
    const files = createMemorySkillFs({
      "~/.kimi/skills/planner/SKILL.md": `---
name: planner
description: Plan helper
---
# Planner
`,
      "~/.claude/skills/reviewer/SKILL.md": `---
name: reviewer
description: Review helper
---
# Reviewer
`,
      "~/.codex/skills/builder/SKILL.md": `---
name: builder
description: Build helper
---
# Builder
`,
    });

    const report = await scanSkills(files, {
      mergeAllAvailableSkills: true,
    });

    expect(report.paths.filter((entry) => entry.selected).map((entry) => entry.id)).toEqual([
      "user-brand-kimi",
      "user-brand-claude",
      "user-brand-codex",
    ]);
    expect(report.summary.total).toBe(3);
  });

  it("marks later duplicate skills as overridden based on discovery priority", async () => {
    const files = createMemorySkillFs({
      "~/.kimi/skills/reviewer/SKILL.md": `---
name: reviewer
description: Preferred reviewer
---
# Reviewer
`,
      "~/.claude/skills/reviewer/SKILL.md": `---
name: reviewer
description: Secondary reviewer
---
# Reviewer
`,
    });

    const report = await scanSkills(files, {
      mergeAllAvailableSkills: true,
    });

    const effective = report.skills.find((skill) => skill.sourceLabel.includes("~/.kimi/skills"));
    const overridden = report.skills.find((skill) => skill.sourceLabel.includes("~/.claude/skills"));

    expect(effective?.effective).toBe(true);
    expect(overridden?.effective).toBe(false);
    expect(overridden?.overriddenBy).toContain("reviewer");
  });

  it("uses custom directories instead of auto discovery when extra dirs are provided", async () => {
    const files = createMemorySkillFs({
      "/tmp/custom-skills/custom-writer/SKILL.md": `---
name: custom-writer
description: Custom directory
---
# Custom
`,
      "~/.kimi/skills/ignored/SKILL.md": `---
name: ignored
description: Should not load
---
# Ignored
`,
    });

    const report = await scanSkills(files, {
      mergeAllAvailableSkills: true,
      extraDirs: ["/tmp/custom-skills"],
    });

    expect(report.discoveryMode).toBe("custom");
    expect(report.skills.map((skill) => skill.name)).toEqual(["custom-writer", "ignored"]);
    expect(report.skills.find((skill) => skill.name === "custom-writer")?.enabled).toBe(true);
    expect(report.skills.find((skill) => skill.name === "ignored")?.enabled).toBe(false);
    expect(report.paths.find((entry) => entry.id === "user-brand-kimi")?.selected).toBe(false);
  });

  it("still infers flow skills from frontmatter and diagram content", async () => {
    const files = createMemorySkillFs({
      "~/.kimi/skills/flow-helper/SKILL.md": `---
name: FlowHelper
type: flow
---
# Flow Helper

\`\`\`mermaid
graph TD
BEGIN --> middle
\`\`\`
`,
    });

    const report = await scanSkills(files, {
      mergeAllAvailableSkills: false,
    });

    expect(report.skills[0]?.metadata.type).toBe("flow");
    expect(report.summary.warnings).toBe(0);
    expect(report.summary.errors).toBe(0);
  });

  it("marks duplicate skills from disabled directories as not effective", async () => {
    const files = createMemorySkillFs({
      "~/.kimi/skills/reviewer/SKILL.md": `---
name: reviewer
description: Preferred reviewer
---
# Reviewer
`,
      "~/.codex/skills/reviewer/SKILL.md": `---
name: reviewer
description: Visible but disabled
---
# Reviewer
`,
    });

    const report = await scanSkills(files, {
      mergeAllAvailableSkills: false,
    });

    const enabled = report.skills.find((skill) => skill.sourceLabel.includes("~/.kimi/skills"));
    const disabled = report.skills.find((skill) => skill.sourceLabel.includes("~/.codex/skills"));

    expect(enabled?.enabled).toBe(true);
    expect(enabled?.effective).toBe(true);
    expect(disabled?.enabled).toBe(false);
    expect(disabled?.effective).toBe(false);
    expect(disabled?.overriddenBy).toBe("Disabled directory");
  });
});

function createMemorySkillFs(files: Record<string, string>) {
  const normalizedFiles = new Map(
    Object.entries(files).map(([path, content]) => [normalizePath(path), content]),
  );
  const directories = new Set<string>();

  for (const path of normalizedFiles.keys()) {
    let current = dirname(path);
    while (current && !directories.has(current)) {
      directories.add(current);
      const parent = dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }

  return {
    async readText(path: string): Promise<string | null> {
      return normalizedFiles.get(normalizePath(path)) ?? null;
    },
    async listDir(path: string): Promise<Array<{ name: string; isDirectory: boolean }>> {
      const normalized = normalizePath(path);
      const children = new Map<string, boolean>();

      for (const directory of directories) {
        if (!isDirectChild(normalized, directory)) {
          continue;
        }
        children.set(directory.slice(normalized.length + (normalized === "~" ? 2 : 1)), true);
      }

      for (const file of normalizedFiles.keys()) {
        const parent = dirname(file);
        if (parent !== normalized) {
          continue;
        }
        children.set(file.slice(parent.length + 1), false);
      }

      return [...children.entries()]
        .filter(([name]) => name.length > 0)
        .map(([name, isDirectory]) => ({ name, isDirectory }))
        .sort((left, right) => left.name.localeCompare(right.name));
    },
    async pathExists(path: string): Promise<boolean> {
      const normalized = normalizePath(path);
      return directories.has(normalized) || normalizedFiles.has(normalized);
    },
  };
}

function normalizePath(path: string): string {
  return path.replace(/\/+/g, "/").replace(/\/$/, "");
}

function dirname(path: string): string {
  const normalized = normalizePath(path);
  if (normalized === "~" || normalized === "/") {
    return normalized;
  }
  const index = normalized.lastIndexOf("/");
  if (index <= 0) {
    return normalized.startsWith("~") ? "~" : "/";
  }
  return normalized.slice(0, index);
}

function isDirectChild(parent: string, child: string): boolean {
  if (!child.startsWith(parent === "/" ? "/" : `${parent}/`)) {
    return false;
  }
  const remainder = child.slice(parent === "/" ? 1 : parent.length + 1);
  return remainder.length > 0 && !remainder.includes("/");
}
