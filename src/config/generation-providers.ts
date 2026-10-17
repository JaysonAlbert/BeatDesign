import { localGenerationProvider } from '@/core/generation-providers/local-provider';
import type { GenerationProviderRegistrar } from '@/core/generation-providers/contracts';

/**
 * Source-level extension point for open-source forks.
 *
 * BeatAPI is registered by the core and remains the default. A fork can add a
 * provider implementation here and select BEATDESIGN_GENERATION_PROVIDER.
 * Keep credentials inside that provider's server-only implementation.
 */
export function registerProjectGenerationProviders(
  register: GenerationProviderRegistrar
) { register(localGenerationProvider); }
