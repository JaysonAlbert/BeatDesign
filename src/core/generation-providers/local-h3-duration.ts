import catalog from './local-h3-durations.json';

export type LocalH3Duration = `${number}s`;
export const LOCAL_H3_FPS = catalog.fps;
export const LOCAL_H3_DEFAULT_DURATION = catalog.defaultDuration as LocalH3Duration;
export const LOCAL_H3_DURATIONS = catalog.presets.map(
  ({ duration }) => duration as LocalH3Duration
);

export function getLocalH3Timing(duration: unknown = LOCAL_H3_DEFAULT_DURATION) {
  const preset = catalog.presets.find((item) => item.duration === duration);
  return preset
    ? { ...preset, fps: LOCAL_H3_FPS, durationSeconds: preset.frames / LOCAL_H3_FPS }
    : null;
}

export function requireLocalH3Timing(duration: unknown = LOCAL_H3_DEFAULT_DURATION) {
  const timing = getLocalH3Timing(duration);
  if (!timing) {
    throw new Error(`Unsupported local H3 duration. Choose one of: ${LOCAL_H3_DURATIONS.join(', ')}.`);
  }
  return timing;
}
