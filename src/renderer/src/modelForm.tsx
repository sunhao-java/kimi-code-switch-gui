import { resolveModelPricing } from "@shared/pricing";
import { normalizeEntryName } from "@shared/nameRules";
import type { Locale, ModelPricing, OfficialAccount } from "@shared/types";

import { labelForLocale, MODEL_CAPABILITY_OPTIONS } from "./appOptions";
import { ActionFooter, Field, MultiSelectField, ReadOnlyField, SelectField } from "./formControls";
import { t } from "./i18n";

function formatMessage(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

function ensureEnumOptions(
  options: Array<{ value: string; label: string }>,
  currentValue: string[],
  locale: Locale,
): Array<{ value: string; label: string }> {
  const merged = [...options];
  for (const value of currentValue) {
    if (!value || merged.some((option) => option.value === value)) continue;
    merged.push({
      value,
      label: formatMessage(t(locale, "unknownValue"), { value }),
    });
  }
  return merged;
}

export function ModelForm(props: {
  locale: Locale;
  providers: string[];
  officialAccounts: OfficialAccount[];
  activeOfficialAccountId?: string;
  name: string;
  value: {
    provider: string;
    model: string;
    max_context_size: number;
    capabilities: string[];
    auth_mode?: "api-key" | "official-account";
    official_account_scope?: "global";
    pricing?: ModelPricing;
  };
  onChange: (
    name: string,
    patch: Partial<{
      provider: string;
      model: string;
      max_context_size: number;
      capabilities: string[];
      auth_mode?: "api-key" | "official-account";
      official_account_scope?: "global";
      pricing?: ModelPricing;
    }>,
  ) => void;
  onSave: () => void;
  onDelete: () => void;
}): JSX.Element {
  const capabilityOptions = ensureEnumOptions(
    MODEL_CAPABILITY_OPTIONS.map((option) => ({
      value: option.value,
      label: labelForLocale(option.label, props.locale),
    })),
    props.value.capabilities,
    props.locale,
  );
  const handlePricingChange = (field: keyof ModelPricing, raw: string): void => {
    props.onChange(props.name, { pricing: nextPricingFromInput(props.value.pricing, field, raw) });
  };
  const authMode = props.value.auth_mode ?? "api-key";
  const activeOfficialAccount = props.officialAccounts.find((account) => account.id === props.activeOfficialAccountId);

  return (
    <section className="glass-panel form-panel">
      <div className="section-title">{t(props.locale, "modelEditor")}</div>
      <ReadOnlyField label={t(props.locale, "formName")} value={props.name} />
      <SelectField
        label={t(props.locale, "modelAuthMode")}
        value={authMode}
        onChange={(value) => props.onChange(props.name, {
          auth_mode: value === "official-account" ? "official-account" : "api-key",
          official_account_scope: value === "official-account" ? "global" : undefined,
        })}
        options={[
          { value: "api-key", label: t(props.locale, "modelAuthModeApiKey") },
          { value: "official-account", label: t(props.locale, "modelAuthModeOfficialAccount") },
        ]}
      />
      {authMode === "official-account" ? (
        <div className="form-note">
          <strong>{t(props.locale, "modelOfficialAccountCurrent")}</strong>
          <span>{activeOfficialAccount?.display_name || t(props.locale, "modelOfficialAccountMissing")}</span>
        </div>
      ) : null}
      <SelectField
        label={t(props.locale, "formProvider")}
        value={props.value.provider}
        onChange={(value) => props.onChange(props.name, { provider: value })}
        options={props.providers.map((provider) => ({ value: provider, label: provider }))}
      />
      <Field label={t(props.locale, "formModel")} value={props.value.model} onChange={(value) => props.onChange(props.name, { model: normalizeEntryName(value) })} />
      <Field label={t(props.locale, "formContextSize")} value={String(props.value.max_context_size)} onChange={(value) => props.onChange(props.name, { max_context_size: Number(value) || 0 })} />
      <MultiSelectField
        label={t(props.locale, "formCapabilities")}
        value={props.value.capabilities}
        onChange={(value) => props.onChange(props.name, { capabilities: value })}
        options={capabilityOptions}
        emptyLabel={t(props.locale, "formCapabilitiesEmpty")}
        popoverClassName="field-select-popover-full"
      />
      <ModelPricingEditor locale={props.locale} model={props.value.model} pricing={props.value.pricing} onChange={handlePricingChange} />
      <ActionFooter onSave={props.onSave} onDelete={props.onDelete} saveLabel={t(props.locale, "saveModel")} deleteLabel={t(props.locale, "delete")} />
    </section>
  );
}

const PRICING_FIELDS: ReadonlyArray<{ field: keyof ModelPricing; labelKey: string }> = [
  { field: "input_per_mtok", labelKey: "pricingInput" },
  { field: "output_per_mtok", labelKey: "pricingOutput" },
  { field: "cache_read_per_mtok", labelKey: "pricingCacheRead" },
  { field: "cache_creation_per_mtok", labelKey: "pricingCacheCreation" },
];

export function nextPricingFromInput(current: ModelPricing | undefined, field: keyof ModelPricing, raw: string): ModelPricing | undefined {
  const trimmed = raw.trim();
  const parsed = trimmed === "" ? undefined : Number(trimmed);
  const value = parsed !== undefined && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  const draft: Partial<ModelPricing> = {
    input_per_mtok: current?.input_per_mtok,
    output_per_mtok: current?.output_per_mtok,
    cache_read_per_mtok: current?.cache_read_per_mtok,
    cache_creation_per_mtok: current?.cache_creation_per_mtok,
  };
  if (value === undefined) delete draft[field];
  else draft[field] = value;
  if (!Object.values(draft).some((item) => item !== undefined)) return undefined;
  return {
    input_per_mtok: draft.input_per_mtok ?? 0,
    output_per_mtok: draft.output_per_mtok ?? 0,
    ...(draft.cache_read_per_mtok !== undefined ? { cache_read_per_mtok: draft.cache_read_per_mtok } : {}),
    ...(draft.cache_creation_per_mtok !== undefined ? { cache_creation_per_mtok: draft.cache_creation_per_mtok } : {}),
  };
}

function ModelPricingEditor(props: {
  locale: Locale;
  model: string;
  pricing?: ModelPricing;
  onChange: (field: keyof ModelPricing, raw: string) => void;
}): JSX.Element {
  const defaults = resolveModelPricing({ model: props.model });
  return (
    <div className="model-pricing-editor">
      <div className="model-pricing-head">{t(props.locale, "pricingTitle")}</div>
      <div className="model-pricing-grid">
        {PRICING_FIELDS.map(({ field, labelKey }) => {
          const overridden = props.pricing?.[field];
          const fallback = defaults?.[field];
          const placeholder = fallback !== undefined
            ? formatMessage(t(props.locale, "pricingDefaultPlaceholder"), { value: fallback })
            : "";
          return (
            <label key={field} className="model-pricing-field">
              <span>{t(props.locale, labelKey)}</span>
              <div className="pricing-input">
                <span className="pricing-affix">$</span>
                <input
                  inputMode="decimal"
                  value={overridden !== undefined ? String(overridden) : ""}
                  placeholder={placeholder}
                  onChange={(event) => props.onChange(field, event.target.value)}
                />
                <span className="pricing-affix pricing-affix-suffix">/1M</span>
              </div>
            </label>
          );
        })}
      </div>
      <p className="model-pricing-hint">{t(props.locale, "pricingHint")}</p>
    </div>
  );
}
