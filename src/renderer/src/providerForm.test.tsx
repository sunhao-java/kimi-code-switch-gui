import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { t } from "./i18n";
import { ProviderForm } from "./providerForm";

const locale = "en-US" as const;

function renderProviderForm(overrides: Partial<React.ComponentProps<typeof ProviderForm>> = {}) {
  const props: React.ComponentProps<typeof ProviderForm> = {
    locale,
    name: "openai",
    nameEditable: true,
    value: {
      type: "openai_compatible",
      base_url: "https://api.example.com/v1",
      api_key: "secret",
    },
    onChange: vi.fn(),
    onSave: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  return { ...render(<ProviderForm {...props} />), props };
}

describe("ProviderForm", () => {
  it("prevents saving an invalid endpoint", () => {
    const onSave = vi.fn();
    const { getByText } = renderProviderForm({
      value: { type: "openai_compatible", base_url: "not a url", api_key: "secret" },
      onSave,
    });

    fireEvent.click(getByText(t(locale, "saveProvider")));

    expect(onSave).not.toHaveBeenCalled();
    expect(getByText(t(locale, "endpointInvalidUrl"))).toBeDefined();
  });

  it("toggles the API key visibility", () => {
    const { getByDisplayValue, getByLabelText } = renderProviderForm();
    const input = getByDisplayValue("secret") as HTMLInputElement;

    expect(input.type).toBe("password");
    fireEvent.click(getByLabelText(t(locale, "showSecret")));
    expect(input.type).toBe("text");
  });
});
