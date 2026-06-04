import { useState } from "react";
import { X } from "lucide-react";
import type { AppState, Locale } from "@shared/types";
import { upsertProvider, upsertModel, upsertProfile, applyProfile } from "@shared/configStore";
import { buildModelName } from "@shared/nameRules";
import type { SourcePreset } from "./sourcePresets";
import type { ConnectionFormData } from "./WizardStep2Connect";
import { WizardStep1Source } from "./WizardStep1Source";
import { WizardStep2Connect } from "./WizardStep2Connect";
import { WizardStep3Name } from "./WizardStep3Name";
import { t } from "../i18n";

interface WizardProps {
  locale: Locale;
  state: AppState;
  onComplete: (updater: (draft: AppState) => void, profileName: string) => void;
  onCancel: () => void;
}

type WizardStep = 1 | 2 | 3;

export function AddAssistantWizard(props: WizardProps): JSX.Element {
  const { locale, state, onComplete, onCancel } = props;
  const [step, setStep] = useState<WizardStep>(1);
  const [source, setSource] = useState<SourcePreset | null>(null);
  const [formData, setFormData] = useState<ConnectionFormData>({ apiKey: "", endpoint: "", modelId: "" });

  return (
    <div className="wizard-overlay" onClick={onCancel}>
      <div className="wizard-modal glass-panel" onClick={(e) => e.stopPropagation()}>
        <div className="wizard-topbar">
          <div className="wizard-progress">
            {([1, 2, 3] as const).map((s) => (
              <span key={s} className={step >= s ? "wizard-dot active" : "wizard-dot"} />
            ))}
          </div>
          <span className="wizard-step-label">{step}/3</span>
          <button type="button" className="wizard-close" aria-label={t(locale, "close")} onClick={onCancel}>
            <X size={16} />
          </button>
        </div>

        {step === 1 ? (
          <WizardStep1Source
            locale={locale}
            onSelect={(preset) => {
              setSource(preset);
              setFormData({ apiKey: "", endpoint: preset.defaultEndpoint, modelId: preset.commonModels[0] ?? "" });
              setStep(2);
            }}
          />
        ) : null}

        {step === 2 && source ? (
          <WizardStep2Connect
            locale={locale}
            source={source}
            initialData={formData}
            onBack={() => setStep(1)}
            onNext={(data) => {
              setFormData(data);
              setStep(3);
            }}
          />
        ) : null}

        {step === 3 && source ? (
          <WizardStep3Name
            locale={locale}
            defaultName={`${source.name} ${formData.modelId}`}
            onBack={() => setStep(2)}
            onComplete={(profileName, activate) => {
              const providerName = `${source.id}-${Date.now()}`;
              const modelName = buildModelName(providerName, formData.modelId);
              onComplete((draft) => {
                upsertProvider(draft, providerName, {
                  type: source.providerType,
                  base_url: formData.endpoint,
                  api_key: formData.apiKey,
                });
                upsertModel(draft, modelName, {
                  provider: providerName,
                  model: formData.modelId,
                  max_context_size: 128000,
                  capabilities: [],
                });
                upsertProfile(draft, {
                  name: profileName,
                  label: profileName,
                  default_model: modelName,
                  default_thinking: true,
                  default_yolo: false,
                  default_plan_mode: false,
                  default_editor: "",
                  theme: "dark",
                  show_thinking_stream: false,
                  merge_all_available_skills: false,
                });
                if (activate) {
                  applyProfile(draft, profileName);
                }
              }, profileName);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
