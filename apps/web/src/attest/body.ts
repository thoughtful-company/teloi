import { deepEqual } from "./deep-equal";

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Asserts that a value is neither `null` nor `undefined`.
 *
 * @param value - The value to verify is present
 * @throws Error if `value` is `null` or `undefined`
 */
export function existence<T>(
  value: T | null | undefined,
): asserts value is NonNullable<T> {
  if (value === undefined || value === null) {
    throw new Error("Value is not present");
  }
}

/**
 * Asserts that a value is neither `undefined` nor `null`.
 *
 * @param value - The value to validate is defined (not `undefined` or `null`)
 * @throws Error if `value` is `undefined` or `null` (message: "Value is not defined")
 */
export function isDefined<T>(value: T | null | undefined): asserts value is NonNullable<T> {
  if (value === undefined || value === null) {
    throw new Error("Value is not defined");
  }
}

export function isEqual<T>(value: T, equalTo: T): asserts value is T;
/**
 * Asserts that a value is deeply equal to a given reference.
 *
 * @param value - The value to verify.
 * @param equalTo - The expected value to compare against.
 * @throws Error if `value` is not deeply equal to `equalTo`.
 */
export function isEqual<T>(value: unknown, equalTo: T): asserts value is T {
  if (!deepEqual(value, equalTo)) {
    throw new Error(
      `Values are not equal: ${safeStringify(value)} !== ${safeStringify(equalTo)}`,
    );
  }
}

export function notEqual<T>(value: T, notEqualTo: T): void;
/**
 * Asserts that `value` is not deeply equal to `notEqualTo`.
 *
 * @param value - The value to check against `notEqualTo`.
 * @param notEqualTo - The value that `value` must not be deeply equal to.
 * @throws Error if `value` and `notEqualTo` are deeply equal; the error message includes their JSON representations.
 */
export function notEqual<T>(value: unknown, notEqualTo: T): void {
  if (deepEqual(value, notEqualTo)) {
    throw new Error(
      `Values should not be equal: ${safeStringify(value)} === ${safeStringify(notEqualTo)}`,
    );
  }
}
