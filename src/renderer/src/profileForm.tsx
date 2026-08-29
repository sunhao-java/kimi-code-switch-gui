import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, LoaderCircle, Play, RefreshCw, X } from "lucide-react";

import type { Locale, Profile, ProfileConnectivityTestResult } from "@shared/types";

import { useDialogEscape, useFocusTrap } from "./dialogs";
import { ActionFooter, Field, ReadOnlyField, SelectField, Toggle } from "./formControls";
import { t } from "./i18n";

function formatMessage(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

export function ProfileForm(props: {
  locale: Locale;
  models: string[];
  name: string;
  nameEditable: boolean;
  value: Profile;
  isActive: boolean;
  isTesting: boolean;
  onChange: (name: string, value: Profile) => void;
  onSave: () => void;
  onTest: (modelName: string) => Promise<ProfileConnectivityTestResult>;
  onActivate: () => void;
  onClone: () => void;
  onDelete: () => void;
}): JSX.Element {
  const value = props.value;
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false);
  return (
    <section className="glass-panel form-panel">
      <div className="section-title">{t(props.locale, "profileEditor")}</div>
      {props.nameEditable ? (
        <Field label={t(props.locale, "profileFormUniqueId")} value={props.name} onChange={(next) => props.onChange(next, { ...value, name: next })} />
      ) : (
        <ReadOnlyField label={t(props.locale, "profileFormUniqueId")} value={props.name} />
      )}
      <Field label={t(props.locale, "profileFormDisplayName")} value={value.label} onChange={(next) => props.onChange(props.name, { ...value, label: next })} />
      <SelectField
        label={t(props.locale, "formDefaultModel")}
        value={value.default_model}
        onChange={(next) => props.onChange(props.name, { ...value, default_model: next })}
        options={props.models.map((model) => ({ value: model, label: model }))}
      />
      <Toggle label={t(props.locale, "formThinking")} checked={value.default_thinking} onChange={(checked) => props.onChange(props.name, { ...value, default_thinking: checked })} />
      <Toggle label={t(props.locale, "formYolo")} checked={value.default_yolo} onChange={(checked) => props.onChange(props.name, { ...value, default_yolo: checked })} />
      <Toggle label={t(props.locale, "formPlanMode")} checked={value.default_plan_mode} onChange={(checked) => props.onChange(props.name, { ...value, default_plan_mode: checked })} />
      <Toggle label={t(props.locale, "formStream")} checked={value.show_thinking_stream} onChange={(checked) => props.onChange(props.name, { ...value, show_thinking_stream: checked })} />
      <Toggle label={t(props.locale, "formMergeSkills")} checked={value.merge_all_available_skills} onChange={(checked) => props.onChange(props.name, { ...value, merge_all_available_skills: checked })} />
      <ActionFooter onSave={props.onSave} onDelete={props.onDelete} saveLabel={t(props.locale, "saveProfile")} deleteLabel={t(props.locale, "delete")}>
        <button className={props.isTesting ? "action-button is-loading" : "action-button"} type="button" disabled={props.isTesting} onClick={() => setIsTestDialogOpen(true)}>
          {props.isTesting ? <LoaderCircle size={16} className="button-spinner" /> : null}
          <span>{props.isTesting ? t(props.locale, "profileTesting") : t(props.locale, "profileTest")}</span>
        </button>
        <button className={props.isActive ? "action-button action-button-primary" : "action-button"} onClick={props.onActivate}>{t(props.locale, "activate")}</button>
        <button className="action-button" onClick={props.onClone}>{t(props.locale, "clone")}</button>
      </ActionFooter>
      {isTestDialogOpen ? (
        <ProfileTestDialog
          locale={props.locale}
          profile={value}
          profileName={props.name}
          models={props.models}
          onTest={props.onTest}
          onClose={() => setIsTestDialogOpen(false)}
        />
      ) : null}
    </section>
  );
}

function ProfileTestDialog(props: {
  locale: Locale;
  profile: Profile;
  profileName: string;
  models: string[];
  onTest: (modelName: string) => Promise<ProfileConnectivityTestResult>;
  onClose: () => void;
}): JSX.Element {
  const dialogRef = useRef<HTMLElement>(null);
  const testModel = props.profile.default_model;
  const [isTesting, setIsTesting] = useState(false);
  const [result, setResult] = useState<ProfileConnectivityTestResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [hasStarted, setHasStarted] = useState(false);

  useDialogEscape(props.onClose);
  useFocusTrap(dialogRef);

  const runTest = async (modelName: string): Promise<void> => {
    setHasStarted(true);
    setIsTesting(true);
    setErrorMessage("");
    try {
      const nextResult = await props.onTest(modelName);
      setResult(nextResult);
    } catch (error) {
      setResult(null);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsTesting(false);
    }
  };

  const providerType = result?.providerType || "apikey";
  const prompt = result?.prompt ?? "hi";
  const displayModel = result?.modelName ?? testModel;

  return createPortal(
    <div className="profile-test-backdrop" role="presentation" onClick={(event) => {
      if (event.target === event.currentTarget) props.onClose();
    }}>
      <section ref={dialogRef} className="profile-test-dialog glass-panel" role="dialog" aria-modal="true" aria-labelledby="profile-test-title">
        <div className="profile-test-header">
          <h3 id="profile-test-title">{t(props.locale, "profileTestDialogTitle")}</h3>
          <button className="profile-test-close" type="button" aria-label={t(props.locale, "close")} onClick={props.onClose}>
            <X size={24} />
          </button>
        </div>
        <div className="profile-test-body">
          <div className="profile-test-account-card">
            <div className="profile-test-play"><Play size={28} /></div>
            <div className="profile-test-account-copy">
              <strong>{props.profileName}</strong>
              <span><b>{providerType.toUpperCase()}</b>{t(props.locale, "profileTestAccountLabel")}</span>
            </div>
            <span className="profile-test-active">{t(props.locale, "active")}</span>
          </div>
          <ProfileTestConsole
            locale={props.locale}
            profileName={props.profileName}
            providerType={providerType}
            modelName={displayModel}
            prompt={prompt}
            result={result}
            errorMessage={errorMessage}
            isTesting={isTesting}
            hasStarted={hasStarted}
          />
        </div>
        <div className="profile-test-actions">
          <button className="action-button" type="button" onClick={props.onClose}>{t(props.locale, "close")}</button>
          <button className={isTesting ? "action-button action-button-primary is-loading" : "action-button action-button-primary"} type="button" disabled={isTesting} onClick={() => void runTest(testModel)}>
            {isTesting ? <LoaderCircle size={17} className="button-spinner" /> : <RefreshCw size={17} />}
            <span>{isTesting ? t(props.locale, "profileTesting") : hasStarted ? t(props.locale, "profileTestRetry") : t(props.locale, "profileTestStart")}</span>
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function ProfileTestConsole(props: {
  locale: Locale;
  profileName: string;
  providerType: string;
  modelName: string;
  prompt: string;
  result: ProfileConnectivityTestResult | null;
  errorMessage: string;
  isTesting: boolean;
  hasStarted: boolean;
}): JSX.Element {
  const response = props.result?.stdout || props.result?.stderr || "";
  return (
    <div className="profile-test-console">
      {props.hasStarted ? <p className="is-info">{formatMessage(t(props.locale, "profileTestStartAccount"), { name: props.profileName })}</p> : null}
      <p>{formatMessage(t(props.locale, "profileTestAccountType"), { type: props.providerType })}</p>
      <p className={props.errorMessage ? "is-danger" : props.result ? "is-success" : "is-muted"}>
        {props.errorMessage ? t(props.locale, "profileTestFailed") : props.result ? t(props.locale, "profileTestConnected") : t(props.locale, "profileTestStart")}
      </p>
      <p className="is-cyan">{formatMessage(t(props.locale, "profileTestUsingModel"), { model: props.modelName })}</p>
      <p>{formatMessage(t(props.locale, "profileTestSendingPrompt"), { prompt: props.prompt })}</p>
      <p className="is-warning">{t(props.locale, "profileTestResponse")}</p>
      {props.isTesting ? <p className="is-muted">{t(props.locale, "profileTesting")}</p> : props.errorMessage ? <pre className="is-danger">{props.errorMessage}</pre> : response ? <pre className="is-output">{response}</pre> : null}
      <div className="profile-test-console-divider" />
      {!props.isTesting && props.hasStarted ? (
        <p className={props.errorMessage ? "is-danger profile-test-console-status" : "is-success profile-test-console-status"}>
          {props.errorMessage ? <X size={18} /> : <Check size={18} />}
          <span>{props.errorMessage ? t(props.locale, "profileTestFailed") : t(props.locale, "profileTestCompleted")}</span>
        </p>
      ) : null}
    </div>
  );
}
