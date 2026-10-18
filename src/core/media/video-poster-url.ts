/** Only project-owned media can be resolved without fetching a remote video. */
export function getVideoPosterUrl(videoUrl: string | null | undefined) {
  if (!videoUrl) return null;
  try {
    const url = new URL(videoUrl, 'http://beatdesign.local');
    const match = /^\/api\/app\/projects\/([a-zA-Z0-9_-]+)\/assets\/([a-zA-Z0-9_-]+)\/?$/.exec(url.pathname);
    if (!match) return null;
    return `/api/app/projects/${match[1]}/assets/${match[2]}/thumbnail`;
  } catch {
    return null;
  }
}
