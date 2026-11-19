export const log = (
  severity: 'log' | 'warn' | 'error',
  ...optionalParams: any[]
) =>
  // oxlint-disable-next-line fabric/no-restricted-syntax
  console[severity]('fabric', ...optionalParams);

export class FabricError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(`fabric: ${message}`, options);
  }
}

export class SignalAbortedError extends FabricError {
  constructor(context: string) {
    super(`${context} 'options.signal' is in 'aborted' state`);
  }
}

/**
 * Thrown when `resourceValidator` disallows a resource.
 * The resource is skipped intentionally, so it is not treated as a loading failure.
 */
export class ResourceSkippedError extends FabricError {}
