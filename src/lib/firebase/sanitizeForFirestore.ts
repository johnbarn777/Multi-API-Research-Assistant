type SanitizedValue =
  | null
  | string
  | number
  | boolean
  | Date
  | SanitizedValue[]
  | { [key: string]: SanitizedValue };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sanitizeForFirestore<T>(value: T): T extends undefined ? never : SanitizedValue {
  return internalSanitize(value) as T extends undefined ? never : SanitizedValue;
}

function internalSanitize(value: unknown): SanitizedValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value instanceof Date
  ) {
    return value as SanitizedValue;
  }

  if (Array.isArray(value)) {
    const sanitizedItems = value
      .map((item) => internalSanitize(item))
      .filter((item): item is SanitizedValue => item !== undefined);
    return sanitizedItems;
  }

  if (isPlainObject(value)) {
    const sanitizedEntries: Record<string, SanitizedValue> = {};
    for (const [key, rawEntry] of Object.entries(value)) {
      const sanitizedEntry = internalSanitize(rawEntry);
      if (sanitizedEntry !== undefined) {
        sanitizedEntries[key] = sanitizedEntry;
      }
    }
    return sanitizedEntries;
  }

  return undefined;
}
