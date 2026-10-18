import assert from 'node:assert/strict';
import test from 'node:test';

import { renderToStaticMarkup } from 'react-dom/server';

import type { CanvasLabels } from './beatcanvas-front-layer-context';
import { BeatCanvasComposerReferencePicker } from './beatcanvas-composer-reference-picker';

const labels = {
  uploadImageLabel: 'Upload image',
  uploadVideoLabel: 'Upload video',
  uploadAudioLabel: 'Upload audio',
} as CanvasLabels;

test('audio reference picker renders the audio action and alias without an image preview', () => {
  const html = renderToStaticMarkup(<BeatCanvasComposerReferencePicker activeDraftId="draft" isDraftBusy={false} isOpen={true} labels={labels}
    onOpenChange={() => {}} onOpenReferencePicker={() => {}} options={[{intent:'audio', remaining:3}]} primaryIntent="audio"
    currentReferenceCards={[{id:'voice',type:'audio',name:'Voice reference',alias:'@Audio1',thumbnailUrl:'/voice.wav'}]} />);
  assert.match(html, /Upload audio/);
  assert.match(html, /@Audio1/);
  assert.doesNotMatch(html, /<img[^>]*voice.wav/);
});

test('row variant renders an icon-only compact reference upload control', () => {
  const html = renderToStaticMarkup(
    <BeatCanvasComposerReferencePicker
      activeDraftId="draft-1"
      isDraftBusy={false}
      isOpen={false}
      labels={labels}
      onOpenChange={() => {}}
      onOpenReferencePicker={() => {}}
      options={[{ intent: 'image', remaining: 3 }]}
      primaryIntent="image"
      variant="row"
    />
  );

  assert.match(html, /aria-label="Upload image"/);
  assert.match(html, /h-7 w-7/);
  assert.match(html, /border-dashed/);
  assert.doesNotMatch(html, />Upload image</);
  assert.doesNotMatch(html, />3</);
  assert.doesNotMatch(html, /h-8 w-8/);
});

test('open picker lists attached and canvas reference cards', () => {
  const html = renderToStaticMarkup(
    <BeatCanvasComposerReferencePicker
      activeDraftId="draft-1"
      canvasReferenceCards={[
        {
          id: 'asset-2',
          name: 'Beach',
          type: 'image',
          thumbnailUrl: 'https://example.com/beach.webp',
        },
      ]}
      currentReferenceCards={[
        {
          id: 'asset-1',
          name: 'Sunset',
          type: 'image',
          thumbnailUrl: 'https://example.com/sunset.webp',
        },
      ]}
      isDraftBusy={false}
      isOpen={true}
      labels={{
        ...labels,
        currentReferencesLabel: 'Attached',
        fromCanvasLabel: 'From canvas',
        removeReferenceLabel: 'Remove reference',
      }}
      onAttachCanvasReference={() => {}}
      onOpenChange={() => {}}
      onOpenReferencePicker={() => {}}
      onRemoveCanvasReference={() => {}}
      options={[{ intent: 'image', remaining: 3 }]}
      primaryIntent="image"
    />
  );

  assert.match(html, /Attached/);
  assert.match(html, /Sunset/);
  assert.match(html, /From canvas/);
  assert.match(html, /Beach/);
  assert.match(html, /aria-label="Remove reference"/);
});

test('open picker keeps canvas references beyond the first eight selectable', () => {
  const canvasReferenceCards = Array.from({ length: 10 }, (_, index) => ({
    id: `asset-${index + 1}`,
    name: `Reference ${index + 1}`,
    type: 'image' as const,
    thumbnailUrl: `https://example.com/reference-${index + 1}.webp`,
  }));

  const html = renderToStaticMarkup(
    <BeatCanvasComposerReferencePicker
      activeDraftId="draft-1"
      canvasReferenceCards={canvasReferenceCards}
      isDraftBusy={false}
      isOpen={true}
      labels={{
        ...labels,
        fromCanvasLabel: 'From canvas',
      }}
      onAttachCanvasReference={() => {}}
      onOpenChange={() => {}}
      onOpenReferencePicker={() => {}}
      options={[{ intent: 'image', remaining: null }]}
      primaryIntent="image"
    />
  );

  assert.match(html, /title="Reference 1"/);
  assert.match(html, /title="Reference 10"/);
});

test('open picker never mounts video references to make thumbnails', () => {
  const html = renderToStaticMarkup(
    <BeatCanvasComposerReferencePicker
      activeDraftId="draft-1"
      canvasReferenceCards={[
        {
          id: 'video-2',
          name: 'Canvas motion',
          type: 'video',
          thumbnailUrl: 'blob:canvas-motion',
        },
      ]}
      currentReferenceCards={[
        {
          id: 'video-1',
          name: 'Attached motion',
          type: 'video',
          thumbnailUrl: 'blob:attached-motion',
        },
      ]}
      isDraftBusy={false}
      isOpen={true}
      labels={{
        ...labels,
        currentReferencesLabel: 'Attached',
        fromCanvasLabel: 'From canvas',
        removeReferenceLabel: 'Remove reference',
      }}
      onAttachCanvasReference={() => {}}
      onOpenChange={() => {}}
      onOpenReferencePicker={() => {}}
      onRemoveCanvasReference={() => {}}
      options={[{ intent: 'video', remaining: 2 }]}
      primaryIntent="video"
    />
  );

  assert.equal((html.match(/<video/g) ?? []).length, 0);
  assert.doesNotMatch(html, /<img[^>]+blob:(?:attached|canvas)-motion/);
});

test('row variant exposes independently numbered image and video mention chips', () => {
  const html = renderToStaticMarkup(
    <BeatCanvasComposerReferencePicker
      activeDraftId="draft-1"
      currentReferenceCards={[
        {
          id: 'image-1',
          name: 'Character',
          type: 'image',
          alias: '@Image1',
          thumbnailUrl: 'https://example.com/character.png',
        },
        {
          id: 'video-1',
          name: 'Dance motion',
          type: 'video',
          alias: '@Video1',
          thumbnailUrl: 'https://example.com/motion.mp4',
        },
      ]}
      isDraftBusy={false}
      isOpen={false}
      labels={labels}
      onOpenChange={() => {}}
      onOpenReferencePicker={() => {}}
      options={[
        { intent: 'image', remaining: null },
        { intent: 'video', remaining: 2 },
      ]}
      primaryIntent="image"
      variant="row"
    />
  );

  assert.match(html, /@Image1/);
  assert.match(html, /@Video1/);
  assert.match(html, /draggable="true"/);
  assert.equal((html.match(/<video/g) ?? []).length, 0);
});
