import { useRef, useState } from "react";
import { X } from "lucide-react";
import type { AppState, Locale } from "@shared/types";
import { upsertProvider, upsertModel, upsertProfile, applyProfile } from "@shared/configStore";
import { buildModelName } from "@shared/nameRules";
import { createUniqueName } from "../appHelpers";
import { useDialogEscape, useFocusTrap } from "../dialogs";
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
  const [formData, setFormData] = useState<ConnectionFormData>({ apiKey: "", endpoint: "", modelId: "", profileName: "" });
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogEscape(onCancel);
  useFocusTrap(dialogRef);

  return (
    // 多步表单：不允许点遮罩关闭（防半填误触丢失），仅 Esc / 右上角 ✕ 关闭
    <div className="wizard-overlay">
      <div className="wizard-modal glass-panel" ref={dialogRef}>
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
              const modelId = preset.commonModels[0] ?? "";
              setFormData({
                apiKey: "",
                endpoint: preset.defaultEndpoint,
                modelId,
                profileName: createUniqueName(`${preset.name} ${modelId}`.trim(), Object.keys(state.profiles)),
              });
              setStep(2);
            }}
          />
        ) : null}

        {step === 2 && source ? (
          <WizardStep2Connect
            locale={locale}
            source={source}
            initialData={formData}
            existingProfileNames={Object.keys(state.profiles)}
            onBack={() => setStep(1)}
            onNext={(data) => {
              setFormData({ ...data, profileName: data.profileName.trim() });
              setStep(3);
            }}
          />
        ) : null}

        {step === 3 && source ? (
          <WizardStep3Name
            locale={locale}
            profileName={formData.profileName}
            onBack={() => setStep(2)}
            onComplete={(profileName, activate) => {
              const providerName = createUniqueName(profileName, Object.keys(state.mainConfig.providers));
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
                  max_context_size: source.defaultContextSize,
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
                  theme: state.profiles[state.activeProfile]?.theme ?? "dark",
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
