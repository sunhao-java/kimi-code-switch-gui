import { basename, join } from "node:path";

export type SkillType = "prompt" | "flow";
export type SkillDiscoveryMode = "auto";
export type SkillPathGroup = "builtin" | "user-brand" | "user-common";

export interface SkillFileAccess {
  readText(path: string): Promise<string | null>;
  listDir(path: string): Promise<Array<{ name: string; isDirectory: boolean }>>;
  pathExists(path: string): Promise<boolean>;
}

export interface SkillDiscoveryPath {
  id: string;
  group: SkillPathGroup;
  label: string;
  path: string;
  exists: boolean;
  selected: boolean;
  priority: number;
  reason: string;
}

export interface SkillMetadata {
  name: string;
  description: string;
  type: SkillType;
  license: string;
  compatibility: string;
  metadata: Record<string, string>;
}

export interface SkillEntry {
  id: string;
  name: string;
  sourcePathId: string;
  directoryName: string;
  directoryPath: string;
  skillFilePath: string;
  sourceLabel: string;
  sourceGroup: SkillPathGroup;
  priority: number;
  enabled: boolean;
  effective: boolean;
  overriddenBy?: string;
  frontmatter: boolean;
  metadata: SkillMetadata;
  content: string;
  lineCount: number;
  hasScripts: boolean;
  hasReferences: boolean;
  hasAssets: boolean;
}

export interface SkillsScanSummary {
  total: number;
  effective: number;
  overrides: number;
  warnings: number;
  errors: number;
  flow: number;
}

export interface SkillsScanReport {
  builtinNotice: string;
  discoveryMode: SkillDiscoveryMode;
  mergeAllAvailableSkills: boolean;
  paths: SkillDiscoveryPath[];
  skills: SkillEntry[];
  summary: SkillsScanSummary;
}

export async function scanSkills(
  files: SkillFileAccess,
  options: {
    mergeAllAvailableSkills: boolean;
  },
): Promise<SkillsScanReport> {
  const discoveryMode: SkillDiscoveryMode = "auto";
  const paths = await buildDiscoveryPaths(files, {
    mergeAllAvailableSkills: options.mergeAllAvailableSkills,
  });
  const scannedPaths = paths
    .filter((entry) => entry.group !== "builtin" && entry.exists)
    .sort((left, right) => left.priority - right.priority);

  const skills: SkillEntry[] = [];
  const firstLoadedByName = new Map<string, SkillEntry>();

  for (const path of scannedPaths) {
    const discovered = await loadSkillsFromPath(files, path);
    for (const skill of discovered) {
      if (!skill.enabled) {
        skill.effective = false;
        skill.overriddenBy = "Disabled directory";
        skills.push(skill);
        continue;
      }

      const existing = firstLoadedByName.get(skill.name);
      if (!existing) {
        firstLoadedByName.set(skill.name, skill);
      } else {
        skill.effective = false;
        skill.overriddenBy = `${existing.name} · ${existing.sourceLabel}`;
      }
      skills.push(skill);
    }
  }

  const summary = buildSummary(skills);

  return {
    builtinNotice: "Built-in skills are provided by Kimi CLI and are not enumerated from the local filesystem.",
    discoveryMode,
    mergeAllAvailableSkills: options.mergeAllAvailableSkills,
    paths,
    skills,
    summary,
  };
}

async function buildDiscoveryPaths(
  files: SkillFileAccess,
  options: {
    mergeAllAvailableSkills: boolean;
  },
): Promise<SkillDiscoveryPath[]> {
  const candidates = [
    createCandidate("builtin", "builtin", "(managed by CLI package)"),
    createCandidate("user-brand-kimi", "user-brand", "~/.kimi/skills"),
    createCandidate("user-brand-claude", "user-brand", "~/.claude/skills"),
    createCandidate("user-brand-codex", "user-brand", "~/.codex/skills"),
    createCandidate("user-common-config", "user-common", "~/.config/agents/skills"),
    createCandidate("user-common-legacy", "user-common", "~/.agents/skills"),
  ];

  const candidatesWithExistence = await Promise.all(
    candidates.map(async (candidate) => ({
      ...candidate,
      exists: candidate.group === "builtin" ? true : await files.pathExists(candidate.path),
      selected: false,
      priority: Number.MAX_SAFE_INTEGER,
      reason: candidate.group === "builtin" ? "Built-in skills are documented but not scanned from disk." : "",
    })),
  );

  let priority = 0;
  const paths: SkillDiscoveryPath[] = [];

  const selectGroup = (group: SkillPathGroup, mode: "single" | "all"): void => {
    const groupCandidates = candidatesWithExistence.filter((entry) => entry.group === group);
    if (mode === "all") {
      for (const entry of groupCandidates) {
        if (!entry.exists) {
          entry.reason = "Directory not found.";
          continue;
        }
        entry.selected = true;
        entry.priority = priority;
        priority += 1;
        entry.reason = "Loaded because merge_all_available_skills is enabled for brand directories.";
      }
      return;
    }

    const selected = groupCandidates.find((entry) => entry.exists);
    for (const entry of groupCandidates) {
      if (entry === selected) {
        entry.selected = true;
        entry.priority = priority;
        priority += 1;
        entry.reason = "First existing directory in this priority group.";
      } else if (entry.exists) {
        entry.reason = "Skipped because a higher-priority directory in the same group already exists.";
      } else {
        entry.reason = "Directory not found.";
      }
    }
  };

  selectGroup("user-brand", options.mergeAllAvailableSkills ? "all" : "single");
  selectGroup("user-common", "single");

  paths.push(...candidatesWithExistence);
  return paths;
}

async function loadSkillsFromPath(
  files: SkillFileAccess,
  source: SkillDiscoveryPath,
): Promise<SkillEntry[]> {
  if (!source.exists || source.group === "builtin") {
    return [];
  }

  const rootSkillPath = join(source.path, "SKILL.md");
  if (await files.pathExists(rootSkillPath)) {
    const skill = await buildSkillEntry(files, {
      rootPath: source.path,
      directoryName: basename(source.path),
      source,
    });
    return skill ? [skill] : [];
  }

  const entries = await files.listDir(source.path);
  const skills = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory)
      .map((entry) =>
        buildSkillEntry(files, {
          rootPath: join(source.path, entry.name),
          directoryName: entry.name,
          source,
        }),
      ),
  );

  return skills.filter((entry): entry is SkillEntry => Boolean(entry));
}

async function buildSkillEntry(
  files: SkillFileAccess,
  options: {
    rootPath: string;
    directoryName: string;
    source: SkillDiscoveryPath;
  },
): Promise<SkillEntry | null> {
  const skillFilePath = join(options.rootPath, "SKILL.md");
  const content = await files.readText(skillFilePath);
  if (!content?.trim()) {
    return null;
  }

  const frontmatter = parseFrontmatter(content);
  const metadata = normalizeMetadata(frontmatter.attributes, options.directoryName, frontmatter.body);
  const children = await files.listDir(options.rootPath);

  return {
    id: `${options.source.id}:${metadata.name}:${options.directoryName}`,
    name: metadata.name,
    sourcePathId: options.source.id,
    directoryName: options.directoryName,
    directoryPath: options.rootPath,
    skillFilePath,
    sourceLabel: options.source.label,
    sourceGroup: options.source.group,
    priority: options.source.priority,
    enabled: options.source.selected,
    effective: true,
    frontmatter: frontmatter.hasFrontmatter,
    metadata,
    content,
    lineCount: content.split(/\r?\n/).length,
    hasScripts: children.some((entry) => entry.isDirectory && entry.name === "scripts"),
    hasReferences: children.some((entry) => entry.isDirectory && entry.name === "references"),
    hasAssets: children.some((entry) => entry.isDirectory && entry.name === "assets"),
  };
}

function parseFrontmatter(document: string): {
  hasFrontmatter: boolean;
  attributes: Record<string, string | Record<string, string>>;
  body: string;
} {
  if (!document.startsWith("---\n") && !document.startsWith("---\r\n")) {
    return {
      hasFrontmatter: false,
      attributes: {},
      body: document,
    };
  }

  const normalized = document.replace(/\r\n/g, "\n");
  const endIndex = normalized.indexOf("\n---\n", 4);
  if (endIndex < 0) {
    return {
      hasFrontmatter: false,
      attributes: {},
      body: normalized,
    };
  }

  const header = normalized.slice(4, endIndex).split("\n");
  const body = normalized.slice(endIndex + 5);
  const attributes: Record<string, string | Record<string, string>> = {};
  let currentObjectKey = "";

  for (const rawLine of header) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      continue;
    }

    if (/^\s{2,}[A-Za-z0-9._-]+\s*:/.test(rawLine) && currentObjectKey) {
      const match = rawLine.match(/^\s+([A-Za-z0-9._-]+)\s*:\s*(.*)$/);
      if (!match) {
        continue;
      }
      const current = attributes[currentObjectKey];
      if (typeof current === "object" && current !== null && !Array.isArray(current)) {
        current[match[1]] = stripQuotes(match[2]);
      }
      continue;
    }

    const pair = line.match(/^([A-Za-z0-9._-]+)\s*:\s*(.*)$/);
    if (!pair) {
      currentObjectKey = "";
      continue;
    }

    const [, key, rawValue] = pair;
    if (!rawValue.trim()) {
      attributes[key] = {};
      currentObjectKey = key;
      continue;
    }
    attributes[key] = stripQuotes(rawValue);
    currentObjectKey = "";
  }

  return {
    hasFrontmatter: true,
    attributes,
    body,
  };
}

function normalizeMetadata(
  attributes: Record<string, string | Record<string, string>>,
  directoryName: string,
  body: string,
): SkillMetadata {
  const rawName = typeof attributes.name === "string" ? attributes.name : directoryName;
  const rawDescription =
    typeof attributes.description === "string" && attributes.description.trim()
      ? attributes.description
      : "No description provided.";
  const rawType = typeof attributes.type === "string" ? attributes.type.trim().toLowerCase() : "";
  const metadata =
    typeof attributes.metadata === "object" && attributes.metadata !== null && !Array.isArray(attributes.metadata)
      ? Object.fromEntries(
          Object.entries(attributes.metadata).map(([key, value]) => [key, String(value)]),
        )
      : {};

  return {
    name: rawName.trim() || directoryName,
    description: rawDescription.trim() || "No description provided.",
    type: rawType === "flow" || inferFlowFromContent(body) ? "flow" : "prompt",
    license: typeof attributes.license === "string" ? attributes.license.trim() : "",
    compatibility: typeof attributes.compatibility === "string" ? attributes.compatibility.trim() : "",
    metadata,
  };
}

function inferFlowFromContent(content: string): boolean {
  return /```(?:mermaid|d2)\b/.test(content);
}

function buildSummary(skills: SkillEntry[]): SkillsScanSummary {
  return {
    total: skills.length,
    effective: skills.filter((skill) => skill.effective).length,
    overrides: skills.filter((skill) => !skill.effective).length,
    warnings: 0,
    errors: 0,
    flow: skills.filter((skill) => skill.metadata.type === "flow").length,
  };
}

function createCandidate(id: string, group: SkillPathGroup, path: string): SkillDiscoveryPath {
  return {
    id,
    group,
    label: pathLabel(group, path),
    path,
    exists: false,
    selected: false,
    priority: Number.MAX_SAFE_INTEGER,
    reason: "",
  };
}

function pathLabel(group: SkillPathGroup, path: string): string {
  if (group === "builtin") {
    return "Built-in Skills";
  }
  const prefix =
    group === "user-brand"
      ? "User Brand"
      : "User Common";
  return `${prefix} · ${path}`;
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
