import { deepEqual } from "./deep-equal";

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function existence<T>(
  value: T | null | undefined,
): asserts value is NonNullable<T> {
  if (value === undefined || value === null) {
    throw new Error("Value is not present");
  }
}

export function isDefined<T>(value: T | null | undefined): asserts value is NonNullable<T> {
  if (value === undefined || value === null) {
    throw new Error("Value is not defined");
  }
}

export function isEqual<T>(value: T, equalTo: T): asserts value is T;
export function isEqual<T>(value: unknown, equalTo: T): asserts value is T {
  if (!deepEqual(value, equalTo)) {
    throw new Error(
      `Values are not equal: ${safeStringify(value)} !== ${safeStringify(equalTo)}`,
    );
  }
}

export function notEqual<T>(value: T, notEqualTo: T): void;
export function notEqual<T>(value: unknown, notEqualTo: T): void {
  if (deepEqual(value, notEqualTo)) {
    throw new Error(
      `Values should not be equal: ${safeStringify(value)} === ${safeStringify(notEqualTo)}`,
    );
  }
}
