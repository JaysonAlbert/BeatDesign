import { localGenerationProvider } from '@/core/generation-providers/local-provider';
import type { GenerationProviderRegistrar } from '@/core/generation-providers/contracts';

/**
 * Source-level extension point for open-source forks.
 *
 * BeatAPI is registered by the core and remains the default. A fork can add a
 * provider implementation here and change ACTIVE_GENERATION_PROVIDER_ID.
 * Keep credentials inside that provider's server-only implementation.
 */
export const ACTIVE_GENERATION_PROVIDER_ID = (import.meta.env?.VITE_GENERATION_PROVIDER || (typeof process !== 'undefined' ? process.env.BEATDESIGN_GENERATION_PROVIDER : '') || 'beatapi');

export function registerProjectGenerationProviders(
  register: GenerationProviderRegistrar
) { register(localGenerationProvider); }
