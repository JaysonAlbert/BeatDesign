export type GenerationRuntimeConfig = {
  providerId: string;
  localOnly: boolean;
};

export function parseLocalOnly(value: string | undefined): boolean {
  if (!value?.trim() || ['0', 'false'].includes(value.trim().toLowerCase())) return false;
  if (['1', 'true'].includes(value.trim().toLowerCase())) return true;
  throw new Error('BEATDESIGN_LOCAL_ONLY must be 1, 0, true or false.');
}

let browserConfig: GenerationRuntimeConfig | undefined;

// Hydrated from the server on every page load, never from a build-time flag.
export function setBrowserGenerationRuntimeConfig(config: GenerationRuntimeConfig) {
  if (typeof window !== 'undefined') browserConfig = config;
}

export function getGenerationRuntimeConfig(): GenerationRuntimeConfig {
  if (typeof window !== 'undefined' && browserConfig) return browserConfig;
  const env = typeof process !== 'undefined' ? process.env : {};
  const localOnly = parseLocalOnly(env.BEATDESIGN_LOCAL_ONLY);
  return {
    localOnly,
    providerId: localOnly ? 'workstation' :
      (env.BEATDESIGN_GENERATION_PROVIDER || import.meta.env?.VITE_GENERATION_PROVIDER || 'beatapi'),
  };
}
