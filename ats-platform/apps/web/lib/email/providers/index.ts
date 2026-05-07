/**
 * Provider factory — resolves a ProviderId → EmailProvider instance.
 *
 * Callers should always use getProvider() rather than importing adapters
 * directly, so new providers can be added by extending this file only.
 */

import type { ProviderId, EmailProvider } from "@/types/email/provider";
import { googleProvider } from "./google";
import { microsoftProvider } from "./microsoft";

const PROVIDERS: Record<ProviderId, EmailProvider> = {
  google:    googleProvider,
  microsoft: microsoftProvider,
};

/**
 * Returns the EmailProvider for the given ProviderId.
 * Throws if the provider ID is not registered.
 */
export function getProvider(id: ProviderId): EmailProvider {
  const provider = PROVIDERS[id];
  if (!provider) {
    throw new Error(`Unknown email provider: ${id}`);
  }
  return provider;
}

export { googleProvider, microsoftProvider };
export type { ProviderId, EmailProvider };
