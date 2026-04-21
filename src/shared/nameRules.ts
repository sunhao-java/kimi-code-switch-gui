export function normalizeEntryName(value: string): string {
  return value.trim();
}

export function buildModelName(provider: string, modelId: string): string {
  const normalizedProvider = normalizeEntryName(provider);
  const normalizedModelId = normalizeEntryName(modelId);

  if (!normalizedProvider || !normalizedModelId) {
    throw new Error("Model provider and model ID are required.");
  }

  return `${normalizedProvider}/${normalizedModelId}`;
}

export function ensureUniqueEntryName(options: {
  kind: string;
  name: string;
  existingNames: string[];
  currentName?: string;
}): string {
  const normalizedName = normalizeEntryName(options.name);
  const normalizedCurrentName = normalizeEntryName(options.currentName ?? "");

  if (!normalizedName) {
    throw new Error(`${options.kind} name is required.`);
  }

  const hasDuplicate = options.existingNames.some(
    (existingName) =>
      normalizeEntryName(existingName) === normalizedName && normalizeEntryName(existingName) !== normalizedCurrentName,
  );

  if (hasDuplicate) {
    throw new Error(`${options.kind} already exists: ${normalizedName}`);
  }

  return normalizedName;
}
