/* eslint-disable no-debugger */
export const shouldNeverHappen = (msg?: string, ...args: unknown[]): never => {
  console.error(msg, ...args);

  if (import.meta.env.DEV) {
    debugger;
  }

  throw new Error(`This should never happen: ${msg}`);
};

export const makeShouldNeverHappenError = (
  msg?: string,
  ...args: unknown[]
) => {
  console.error(msg, ...args);

  if (import.meta.env.DEV) {
    debugger;
  }

  return new Error(`This should never happen: ${msg}`);
};
