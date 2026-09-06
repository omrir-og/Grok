/**
 * Typed error hierarchy for the eToro clients.
 *
 * Per the `building-etoro-api-client` skill, each subclass sets `this.name` so
 * callers can branch on the error across bundle / serialization boundaries
 * where `instanceof` may not survive.
 */

export class EtoroApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = 'EtoroApiError';
  }
}

export class EtoroRateLimitError extends EtoroApiError {
  constructor(msg = 'Rate limit') {
    super(msg, 429);
    this.name = 'EtoroRateLimitError';
  }
}

export class EtoroPayloadTooLargeError extends EtoroApiError {
  constructor(msg = 'Payload too large', statusCode = 413) {
    super(msg, statusCode);
    this.name = 'EtoroPayloadTooLargeError';
  }
}

export class SsoSessionExpiredError extends EtoroApiError {
  constructor(msg = 'eToro session expired') {
    super(msg, 401);
    this.name = 'SsoSessionExpiredError';
  }
}

/** OAuth-style error from the SSO / STS host. */
export class SsoError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public oauthCode?: string,
  ) {
    super(message);
    this.name = 'SsoError';
  }
}

/** Terminal state — the user must re-authorize (see session-expiry skill). */
export class EtoroReconnectRequiredError extends Error {
  constructor(msg = 'Reconnect to eToro required') {
    super(msg);
    this.name = 'EtoroReconnectRequiredError';
  }
}

/**
 * Two failure modes look identical at the 401 layer; this distinguishes a dead
 * session (refresh-token revoked) from a routine, refreshable 401.
 */
export function isSessionDead(err: unknown): boolean {
  if (err instanceof SsoSessionExpiredError) return true;
  if (
    err instanceof SsoError &&
    err.statusCode === 400 &&
    err.oauthCode === 'invalid_grant'
  ) {
    return true;
  }
  return false;
}
