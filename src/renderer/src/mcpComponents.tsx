import { useEffect, useRef, useState } from "react";
import {
  Check, ChevronDown, ChevronUp, Copy, LoaderCircle, Play, RefreshCw, Wrench,
} from "lucide-react";

import type { Locale, McpServerConfig, McpTransport } from "@shared/types";
import type { McpToolInfo } from "./tauri/cli";

import { getApi } from "./appHelpers";
import { t, translateError } from "./i18n";
import { ActionFooter, CompactSelect, Field, ReadOnlyField, Toggle } from "./formControls";

export function switchMcpTransport(server: McpServerConfig, transport: McpTransport): McpServerConfig {
  if (transport === server.transport) {
    return server;
  }
  return {
    enabled: server.enabled,
    transport,
    url: "",
    headers: {},
    command: "",
    args: [],
    env: {},
    extra: server.extra,
  };
}
export function parseListLines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatListLines(value: string[]): string {
  return value.join("\n");
}

export function isRemoteMcpTransport(transport: McpTransport): boolean {
  return transport !== "stdio";
}

export function parseRecordLines(value: string): Record<string, string> {
  const pairs = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.includes("=") ? line.indexOf("=") : line.indexOf(":");
      if (separatorIndex === -1) {
        return null;
      }
      const key = line.slice(0, separatorIndex).trim();
      const entryValue = line.slice(separatorIndex + 1).trim();
      if (!key) {
        return null;
      }
      return [key, entryValue] as const;
    })
    .filter((entry): entry is readonly [string, string] => entry !== null);
  return Object.fromEntries(pairs);
}

export function formatRecordLines(value: Record<string, string>): string {
  return Object.entries(value)
    .map(([key, entryValue]) => `${key}=${entryValue}`)
    .join("\n");
}

function hasValidRecordLines(value: string): boolean {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .every((line) => {
      const separatorIndex = line.includes("=") ? line.indexOf("=") : line.indexOf(":");
      return separatorIndex > 0 && Boolean(line.slice(0, separatorIndex).trim());
    });
}

function LineCodeField(props: {
  label: string;
  hint: string;
  fieldKey: string;
  resetKey: string;
  value: string;
  placeholder: string;
  invalidMessage: string;
  rows?: number;
  onValidChange: (value: string) => boolean;
  onValidityChange: (fieldKey: string, isValid: boolean) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(props.value);
  const [isInvalid, setIsInvalid] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const lineCount = Math.max(1, draft.split("\n").length);

  useEffect(() => {
    setDraft(props.value);
    setIsInvalid(false);
    setScrollTop(0);
    props.onValidityChange(props.fieldKey, true);
  }, [props.resetKey]);

  return (
    <label className={isInvalid ? "field mcp-code-field is-invalid" : "field mcp-code-field"}>
      <span>{props.label}</span>
      <small>{props.hint}</small>
      <div className="mcp-line-editor">
        <div className="mcp-line-numbers" aria-hidden="true">
          <div style={{ transform: `translateY(-${scrollTop}px)` }}>
            {Array.from({ length: lineCount }, (_, index) => (
              <span key={index}>{index + 1}</span>
            ))}
          </div>
        </div>
        <textarea
          rows={props.rows ?? 4}
          spellCheck={false}
          value={draft}
          placeholder={props.placeholder}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          onChange={(event) => {
            const nextValue = event.target.value;
            setDraft(nextValue);
            const isValid = props.onValidChange(nextValue);
            setIsInvalid(!isValid);
            props.onValidityChange(props.fieldKey, isValid);
          }}
        />
      </div>
      {isInvalid ? <em role="alert">{props.invalidMessage}</em> : null}
    </label>
  );
}

function formatJsonPreview(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

type McpToolArgValues = Record<string, string | boolean>;

type McpToolArgumentField = {
  name: string;
  type: string;
  description: string;
  required: boolean;
  enumValues?: string[];
  defaultValue?: unknown;
};

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function extractMcpToolArgumentFields(inputSchema: unknown): McpToolArgumentField[] {
  const schema = readRecord(inputSchema);
  const properties = readRecord(schema?.properties);
  if (!properties) return [];
  const required = Array.isArray(schema?.required)
    ? new Set(schema.required.filter((item): item is string => typeof item === "string"))
    : new Set<string>();

  return Object.entries(properties).map(([name, value]) => {
    const property = readRecord(value) ?? {};
    const typeValue = property.type;
    const type = Array.isArray(typeValue)
      ? typeValue.filter((item): item is string => typeof item === "string").join(" | ")
      : typeof typeValue === "string"
        ? typeValue
        : "string";
    const enumValues = Array.isArray(property.enum)
      ? property.enum.map((item) => String(item))
      : undefined;
    return {
      name,
      type,
      description: typeof property.description === "string" ? property.description : "",
      required: required.has(name),
      enumValues,
      defaultValue: property.default,
    };
  });
}

function defaultValueForMcpField(field: McpToolArgumentField): string | boolean {
  if (typeof field.defaultValue === "boolean") return field.defaultValue;
  if (field.defaultValue !== undefined && typeof field.defaultValue !== "object") return String(field.defaultValue);
  if (field.type.includes("boolean")) return false;
  if (field.type.includes("object")) return "{}";
  if (field.type.includes("array")) return "[]";
  return "";
}

function buildMcpToolArguments(fields: McpToolArgumentField[], values: McpToolArgValues): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values[field.name];
    if (value === undefined || value === "" || value === false && !field.required) continue;
    if (field.type.includes("boolean")) {
      args[field.name] = Boolean(value);
      continue;
    }
    if (field.type.includes("number") || field.type.includes("integer")) {
      args[field.name] = Number(value);
      continue;
    }
    if (field.type.includes("object") || field.type.includes("array")) {
      args[field.name] = JSON.parse(String(value));
      continue;
    }
    args[field.name] = String(value);
  }
  return args;
}

function stringifyMcpToolArguments(fields: McpToolArgumentField[], values: McpToolArgValues): string {
  return formatJsonPreview(buildMcpToolArguments(fields, values));
}

const MCP_TOOL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MCP_TOOL_CACHE_PREFIX = "kimi-code-switch:mcp-tools:";

type McpToolCacheEntry = {
  cachedAt: number;
  tools: McpToolInfo[];
};

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function buildMcpToolCacheKey(serverName: string, server: McpServerConfig): string {
  const identity = server.transport === "stdio"
    ? {
        name: serverName,
        transport: server.transport,
        command: server.command,
        args: server.args,
      }
    : {
        name: serverName,
        transport: server.transport,
        url: server.url,
      };
  return `${MCP_TOOL_CACHE_PREFIX}${stableStringify(identity)}`;
}

function readMcpToolCache(cacheKey: string): McpToolInfo[] | null {
  try {
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<McpToolCacheEntry>;
    if (!Array.isArray(parsed.tools) || typeof parsed.cachedAt !== "number") return null;
    if (Date.now() - parsed.cachedAt > MCP_TOOL_CACHE_TTL_MS) {
      window.localStorage.removeItem(cacheKey);
      return null;
    }
    return parsed.tools;
  } catch {
    return null;
  }
}

function writeMcpToolCache(cacheKey: string, tools: McpToolInfo[]): void {
  try {
    const entry: McpToolCacheEntry = {
      cachedAt: Date.now(),
      tools,
    };
    window.localStorage.setItem(cacheKey, JSON.stringify(entry));
  } catch {
    // Cache failures should not block MCP tool parsing.
  }
}

function McpToolWorkbench(props: {
  locale: Locale;
  serverName: string;
  server: McpServerConfig;
}): JSX.Element {
  const requestSeqRef = useRef(0);
  const cacheKey = buildMcpToolCacheKey(props.serverName, props.server);
  const [tools, setTools] = useState<McpToolInfo[]>([]);
  const [selectedTool, setSelectedTool] = useState("");
  const [argValues, setArgValues] = useState<McpToolArgValues>({});
  const [result, setResult] = useState("");
  const [resultJson, setResultJson] = useState("");
  const [isResultCollapsed, setIsResultCollapsed] = useState(false);
  const [isResultCopied, setIsResultCopied] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [isUsingCachedTools, setIsUsingCachedTools] = useState(false);

  useEffect(() => {
    setTools([]);
    setSelectedTool("");
    setArgValues({});
    setResult("");
    setResultJson("");
    setIsResultCollapsed(false);
    setIsResultCopied(false);
    setIsParsing(false);
    setIsCalling(false);
    setIsUsingCachedTools(false);
    requestSeqRef.current += 1;
    const cachedTools = readMcpToolCache(cacheKey);
    if (cachedTools) {
      setTools(cachedTools);
      setSelectedTool(cachedTools[0]?.name ?? "");
      setIsUsingCachedTools(true);
    }
  }, [cacheKey, props.serverName, props.server.transport]);

  const selectedToolInfo = tools.find((tool) => tool.name === selectedTool);
  const argumentFields = extractMcpToolArgumentFields(selectedToolInfo?.inputSchema);

  useEffect(() => {
    const fields = extractMcpToolArgumentFields(selectedToolInfo?.inputSchema);
    setArgValues(Object.fromEntries(fields.map((field) => [field.name, defaultValueForMcpField(field)])));
    setResultJson("");
    setIsResultCollapsed(false);
    setIsResultCopied(false);
    setResult("");
  }, [selectedTool, selectedToolInfo?.inputSchema]);

  const parseTools = async (): Promise<void> => {
    const api = getApi();
    if (!api?.listMcpServerTools) {
      setResult(t(props.locale, "mcpRuntimeOutdated"));
      return;
    }
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    setIsParsing(true);
    try {
      const response = await api.listMcpServerTools(props.serverName, props.server);
      if (requestSeqRef.current !== requestSeq) return;
      setTools(response.tools);
      writeMcpToolCache(cacheKey, response.tools);
      setIsUsingCachedTools(false);
      setSelectedTool((current) => current && response.tools.some((tool) => tool.name === current)
        ? current
        : response.tools[0]?.name ?? "");
      setResult(response.tools.length ? "" : t(props.locale, "mcpToolNoTools"));
      setResultJson("");
    } catch (error) {
      if (requestSeqRef.current !== requestSeq) return;
      const message = error instanceof Error ? error.message : String(error);
      setResult(translateError(props.locale, message));
    } finally {
      if (requestSeqRef.current === requestSeq) {
        setIsParsing(false);
      }
    }
  };

  const callTool = async (): Promise<void> => {
    const api = getApi();
    if (!api?.callMcpServerTool) {
      setResult(t(props.locale, "mcpRuntimeOutdated"));
      return;
    }
    if (!selectedTool) {
      setResult(t(props.locale, "mcpToolSelectRequired"));
      return;
    }
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    setIsCalling(true);
    try {
      const argsJson = stringifyMcpToolArguments(argumentFields, argValues);
      const response = await api.callMcpServerTool(props.serverName, selectedTool, argsJson, props.server);
      if (requestSeqRef.current !== requestSeq) return;
      setResultJson(formatJsonPreview(response.result));
      setIsResultCollapsed(false);
      setIsResultCopied(false);
      setResult("");
    } catch (error) {
      if (requestSeqRef.current !== requestSeq) return;
      const message = error instanceof Error ? error.message : String(error);
      setResult(translateError(props.locale, message));
      setResultJson("");
    } finally {
      if (requestSeqRef.current === requestSeq) {
        setIsCalling(false);
      }
    }
  };

  const copyResult = (): void => {
    if (!resultJson) return;
    void navigator.clipboard?.writeText(resultJson).then(() => {
      setIsResultCopied(true);
      window.setTimeout(() => setIsResultCopied(false), 1400);
    }).catch(() => setIsResultCopied(false));
  };

  return (
    <section className="mcp-tool-workbench" aria-label={t(props.locale, "mcpToolWorkbenchTitle")}>
      <div className="mcp-tool-workbench-head">
        <div>
          <div className="mcp-tool-workbench-title">
            <Wrench size={15} />
            <span>{t(props.locale, "mcpToolWorkbenchTitle")}</span>
          </div>
          <p>{t(props.locale, "mcpToolWorkbenchHint")}</p>
        </div>
        <button
          className={isParsing ? "action-button compact is-loading" : "action-button compact"}
          type="button"
          disabled={isParsing || isCalling}
          onClick={() => void parseTools()}
        >
          {isParsing ? <LoaderCircle size={15} className="button-spinner" /> : <RefreshCw size={15} />}
          <span>{isParsing
            ? t(props.locale, "mcpToolParsing")
            : t(props.locale, isUsingCachedTools ? "mcpToolReparse" : "mcpToolParse")}</span>
        </button>
      </div>
      <div className="mcp-tool-grid">
        <label className="field mcp-tool-select">
          <span>{t(props.locale, "mcpToolSelect")}</span>
          <CompactSelect
            ariaLabel={t(props.locale, "mcpToolSelect")}
            value={selectedTool}
            disabled={!tools.length}
            options={tools.length
              ? tools.map((tool) => ({ value: tool.name, label: tool.name }))
              : [{ value: "", label: t(props.locale, "mcpToolEmpty") }]}
            onChange={setSelectedTool}
          />
          <small>{selectedToolInfo?.description || t(props.locale, "mcpToolDescriptionFallback")}</small>
        </label>
        <div className="mcp-tool-args-panel">
          <div className="mcp-tool-panel-title">{t(props.locale, "mcpToolArguments")}</div>
          {argumentFields.length ? (
            <div className="mcp-tool-arg-grid">
              {argumentFields.map((field) => (
                <label key={field.name} className="mcp-tool-arg-field">
                  <span>
                    <strong>{field.name}</strong>
                    <em>{field.required ? t(props.locale, "required") : t(props.locale, "optional")}</em>
                    <code>{field.type}</code>
                  </span>
                  {field.enumValues?.length ? (
                    <CompactSelect
                      ariaLabel={field.name}
                      value={String(argValues[field.name] ?? "")}
                      options={[
                        { value: "", label: t(props.locale, "selectPlaceholder") },
                        ...field.enumValues.map((item) => ({ value: item, label: item })),
                      ]}
                      onChange={(value) => setArgValues((current) => ({ ...current, [field.name]: value }))}
                    />
                  ) : field.type.includes("boolean") ? (
                    <Toggle
                      checked={Boolean(argValues[field.name])}
                      onChange={(checked) => setArgValues((current) => ({ ...current, [field.name]: checked }))}
                    />
                  ) : field.type.includes("object") || field.type.includes("array") ? (
                    <textarea
                      rows={3}
                      spellCheck={false}
                      value={String(argValues[field.name] ?? "")}
                      onChange={(event) => setArgValues((current) => ({ ...current, [field.name]: event.target.value }))}
                    />
                  ) : (
                    <input
                      inputMode={field.type.includes("number") || field.type.includes("integer") ? "decimal" : "text"}
                      value={String(argValues[field.name] ?? "")}
                      onChange={(event) => setArgValues((current) => ({ ...current, [field.name]: event.target.value }))}
                    />
                  )}
                  {field.description ? <small>{field.description}</small> : null}
                </label>
              ))}
            </div>
          ) : (
            <div className="mcp-tool-empty-args">{selectedTool ? t(props.locale, "mcpToolNoArguments") : t(props.locale, "mcpToolEmpty")}</div>
          )}
        </div>
      </div>
      {selectedToolInfo?.inputSchema ? (
        <details className="mcp-tool-schema">
          <summary>{t(props.locale, "mcpToolSchema")}</summary>
          <pre>{formatJsonPreview(selectedToolInfo.inputSchema)}</pre>
        </details>
      ) : null}
      <div className="mcp-tool-actions">
        <button
          className={isCalling ? "action-button compact is-loading" : "action-button compact"}
          type="button"
          disabled={isParsing || isCalling || !selectedTool}
          onClick={() => void callTool()}
        >
          {isCalling ? <LoaderCircle size={15} className="button-spinner" /> : <Play size={15} />}
          <span>{isCalling ? t(props.locale, "mcpToolTesting") : t(props.locale, "mcpToolTest")}</span>
        </button>
      </div>
      {result ? (
        <pre className="mcp-tool-result">{result}</pre>
      ) : null}
      {resultJson ? (
        <div className={isResultCollapsed ? "mcp-tool-result-view is-collapsed" : "mcp-tool-result-view"}>
          <div className="mcp-tool-result-toolbar">
            <div className="mcp-tool-panel-title">{t(props.locale, "mcpToolResult")}</div>
            <div>
              <button
                className="mcp-tool-result-icon-button"
                type="button"
                aria-label={isResultCopied ? t(props.locale, "copied") : t(props.locale, "copyContent")}
                title={isResultCopied ? t(props.locale, "copied") : t(props.locale, "copyContent")}
                onClick={copyResult}
              >
                {isResultCopied ? <Check size={14} /> : <Copy size={14} />}
              </button>
              <button
                className="mcp-tool-result-icon-button"
                type="button"
                aria-label={isResultCollapsed ? t(props.locale, "expand") : t(props.locale, "collapse")}
                title={isResultCollapsed ? t(props.locale, "expand") : t(props.locale, "collapse")}
                onClick={() => setIsResultCollapsed((current) => !current)}
              >
                {isResultCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
              </button>
            </div>
          </div>
          {isResultCollapsed ? null : (
            <textarea className="mcp-tool-result-json" readOnly spellCheck={false} rows={10} value={resultJson} />
          )}
        </div>
      ) : null}
    </section>
  );
}

function McpTransportRadioGroup(props: {
  locale: Locale;
  value: McpTransport;
  readOnly: boolean;
  onChange: (value: McpTransport) => void;
}): JSX.Element {
  const transportValue = props.value === "stdio" ? "stdio" : "streamable-http";
  const options: Array<{ value: McpTransport; label: string; description: string }> = [
    {
      value: "stdio",
      label: "stdio",
      description: t(props.locale, "mcpTransportStdioDescription"),
    },
    {
      value: "streamable-http",
      label: "http",
      description: t(props.locale, "mcpTransportHttpDescription"),
    },
  ];

  return (
    <fieldset className="mcp-transport-field">
      <legend>{t(props.locale, "mcpTransportType")}</legend>
      <div className="mcp-transport-options">
        {options.map((option) => (
          <button
            key={option.value}
            className={[
              "mcp-transport-option",
              transportValue === option.value ? "is-active" : "",
              props.readOnly ? "is-readonly" : "",
            ].filter(Boolean).join(" ")}
            type="button"
            role="radio"
            aria-checked={transportValue === option.value}
            disabled={props.readOnly}
            onClick={() => {
              if (!props.readOnly) {
                props.onChange(option.value);
              }
            }}
          >
            <span className="mcp-transport-radio-dot" aria-hidden="true" />
            <span className="mcp-transport-copy">
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </span>
          </button>
        ))}
      </div>
      {props.readOnly ? <p className="mcp-transport-readonly-hint">{t(props.locale, "mcpTransportReadonlyHint")}</p> : null}
    </fieldset>
  );
}

export function McpServerForm(props: {
  locale: Locale;
  name: string;
  nameEditable: boolean;
  value: McpServerConfig;
  isTesting: boolean;
  onRunAction: (action: "test" | "auth" | "reset-auth", name: string) => Promise<void>;
  onChange: (name: string, value: McpServerConfig) => void;
  onSave: () => void;
  onDelete: () => void;
}): JSX.Element {
  const isRemoteTransport = isRemoteMcpTransport(props.value.transport);
  const [invalidLineFields, setInvalidLineFields] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setInvalidLineFields(new Set());
  }, [props.name, props.value.transport]);

  const updateLineFieldValidity = (fieldKey: string, isValid: boolean): void => {
    setInvalidLineFields((current) => {
      const next = new Set(current);
      if (isValid) {
        next.delete(fieldKey);
      } else {
        next.add(fieldKey);
      }
      return next;
    });
  };

  return (
    <section className="glass-panel form-panel mcp-wizard-panel">
      <div className="mcp-wizard-header">
        <div>
          <div className="section-title">{t(props.locale, "mcpWizardTitle")}</div>
          <p>{t(props.locale, "mcpWizardDescription")}</p>
        </div>
      </div>
      <McpTransportRadioGroup
        locale={props.locale}
        value={props.value.transport}
        readOnly={!props.nameEditable}
        onChange={(next) => props.onChange(props.name, switchMcpTransport(props.value, next))}
      />
      {props.nameEditable ? (
        <Field label={t(props.locale, "mcpServerTitle")} value={props.name} onChange={(next) => props.onChange(next, { ...props.value })} />
      ) : (
        <ReadOnlyField label={t(props.locale, "mcpServerTitle")} value={props.name} />
      )}
      {props.value.transport === "sse" || /\/sse([/?#]|$)/.test(props.value.url.trim()) ? (
        <p className="form-hint form-hint-warning">{t(props.locale, "mcpSseUnsupportedHint")}</p>
      ) : null}
      {isRemoteTransport ? (
        <>
          <Field
            label={t(props.locale, "formUrl")}
            value={props.value.url}
            onChange={(next) => props.onChange(props.name, { ...props.value, url: next })}
          />
          <LineCodeField
            label={t(props.locale, "mcpHeadersOptional")}
            hint={t(props.locale, "mcpHeadersLineHint")}
            fieldKey="headers"
            resetKey={`${props.name}:${props.value.transport}:headers`}
            value={formatRecordLines(props.value.headers)}
            placeholder={t(props.locale, "mcpHeadersLinePlaceholder")}
            invalidMessage={t(props.locale, "mcpKeyValueLineInvalid")}
            rows={4}
            onValidityChange={updateLineFieldValidity}
            onValidChange={(next) => {
              if (!hasValidRecordLines(next)) {
                return false;
              }
              props.onChange(props.name, { ...props.value, headers: parseRecordLines(next) });
              return true;
            }}
          />
        </>
      ) : (
        <>
          <Field
            label={t(props.locale, "formCommand")}
            value={props.value.command}
            onChange={(next) => props.onChange(props.name, { ...props.value, command: next })}
          />
          <LineCodeField
            label={t(props.locale, "formArgs")}
            hint={t(props.locale, "mcpArgsLineHint")}
            fieldKey="args"
            resetKey={`${props.name}:${props.value.transport}:args`}
            value={formatListLines(props.value.args)}
            placeholder={t(props.locale, "mcpArgsLinePlaceholder")}
            invalidMessage={t(props.locale, "mcpLineListInvalid")}
            rows={4}
            onValidityChange={updateLineFieldValidity}
            onValidChange={(next) => {
              props.onChange(props.name, { ...props.value, args: parseListLines(next) });
              return true;
            }}
          />
          <LineCodeField
            label={t(props.locale, "formEnv")}
            hint={t(props.locale, "mcpEnvLineHint")}
            fieldKey="env"
            resetKey={`${props.name}:${props.value.transport}:env`}
            value={formatRecordLines(props.value.env)}
            placeholder={t(props.locale, "mcpEnvLinePlaceholder")}
            invalidMessage={t(props.locale, "mcpKeyValueLineInvalid")}
            rows={4}
            onValidityChange={updateLineFieldValidity}
            onValidChange={(next) => {
              if (!hasValidRecordLines(next)) {
                return false;
              }
              props.onChange(props.name, { ...props.value, env: parseRecordLines(next) });
              return true;
            }}
          />
        </>
      )}
      <McpToolWorkbench key={props.name} locale={props.locale} serverName={props.name} server={props.value} />
      <ActionFooter
        onSave={props.onSave}
        onDelete={props.onDelete}
        saveLabel={t(props.locale, "mcpApplyConfig")}
        deleteLabel={t(props.locale, "delete")}
        isSaveDisabled={invalidLineFields.size > 0}
      >
        <button
          className={props.isTesting ? "action-button is-loading" : "action-button"}
          type="button"
          disabled={props.isTesting}
          onClick={() => void props.onRunAction("test", props.name)}
        >
          {props.isTesting ? <LoaderCircle size={16} className="button-spinner" /> : null}
          <span>{props.isTesting ? t(props.locale, "mcpTesting") : t(props.locale, "mcpTest")}</span>
        </button>
      </ActionFooter>
    </section>
  );
}
