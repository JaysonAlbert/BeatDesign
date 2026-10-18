import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { getVideoPosterUrl } from '@/core/media/video-poster-url';
import { CachedVideoPoster } from './cached-video-poster';

test('project video posters use an image endpoint and never mount the original video', () => {
  const video = '/api/app/projects/project-a/assets/video-b';
  const html = renderToStaticMarkup(<CachedVideoPoster src={video} alt="Clip" />);
  assert.match(html, /src="\/api\/app\/projects\/project-a\/assets\/video-b\/thumbnail"/);
  assert.match(html, /loading="lazy"/);
  assert.doesNotMatch(html, /<video/);
  assert.doesNotMatch(html, /src="\/api\/app\/projects\/project-a\/assets\/video-b"/);
  assert.equal(getVideoPosterUrl(`https://example.com${video}?download=1`), `${video}/thumbnail`);
});

test('remote, blob and unresolvable videos retain a placeholder without loading media', () => {
  for (const src of ['https://provider.example/video.mp4', 'blob:local-video', 'data:video/mp4;base64,AAAA', null]) {
    assert.equal(getVideoPosterUrl(src), null);
    const html = renderToStaticMarkup(<CachedVideoPoster src={src} alt="Clip" />);
    assert.doesNotMatch(html, /<(?:video|img)/);
    assert.match(html, /Clip/);
  }
});
