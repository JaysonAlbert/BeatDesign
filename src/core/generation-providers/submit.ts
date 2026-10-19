import { LOCAL_MODELS } from './local-provider';
import { getRegisteredEffectById } from '@/core/effects/registered-effects';
import { readFile, stat } from 'node:fs/promises';

import {
  normalizeAssetFirstGenerationRequest,
  type AssetFirstGenerationRequest,
} from '@/core/commands/generation-contract';
import { compileAssetFirstGenerationInput } from '@/core/commands/generation-compiler';
import {
  claimGenerationUploadSlot,
  completeGenerationUploadSlot,
  failGenerationUploadIntent,
  issueGenerationUploadIntent,
  releaseGenerationUploadSlot,
  getGenerationUploadIntentEffectId,
  getGenerationUploadIntentSourceContext,
} from '@/core/effects/generation-upload-intent';
import { submitEffectGeneration } from '@/core/effects/submit-generation';
import { resolveLocalProjectAssetPath } from '@/core/projects/local-project-assets';
import {
  getProjectAssetById,
  linkGenerationAsset,
} from '@/core/workspace-lib/assets/user-assets';
import { uploadManagedGenerationInput } from '@/core/workspace-storage/managed-generation-input';
import {
  getProject,
  loadProjectWithLatestSnapshot,
} from '@/core/projects/projects';
import { resolveCanvasTextReferences } from '@/core/beatcanvas/text-nodes';
import { assertCanvasGenerationSource } from '@/core/organization/generation-source';
import {
  getGenerationPromptConstraints,
  validateGenerationPrompt,
  validateUploadedImageFile,
  validateUploadedVideoFile,
  validateUploadedAudioFile,
} from '@/core/effects/validation';

import {
  getGenerationModelDescriptor,
  validateGenerationModelInput,
} from './model-catalog';
import {
  getActiveGenerationProvider,
  getGenerationModelBinding,
} from './registry';
import {
  getProviderGenerationAssetUrl,
  needsManagedGenerationReferenceUpload,
} from './reference-delivery';

const getReferenceContentType = (asset: {
  type: 'image' | 'video' | 'audio';
  mimeType: string | null;
}) => {
  if (asset.mimeType?.trim()) return asset.mimeType.split(';')[0].trim();
  if (asset.type === 'video') return 'video/mp4';
  if (asset.type === 'audio') return 'audio/mpeg';
  return 'image/png';
};

async function prepareGenerationReferences({
  generation,
  intentId,
}: {
  generation: AssetFirstGenerationRequest;
  intentId: string;
}) {
  const assets = new Map<
    string,
    NonNullable<Awaited<ReturnType<typeof getProjectAssetById>>>
  >();
  for (const reference of generation.references) {
    if (assets.has(reference.assetId)) continue;
    const asset = await getProjectAssetById({
      projectId: generation.projectId,
      assetId: reference.assetId,
    });
    if (!asset) {
      throw new Error(
        `Asset ${reference.assetId} does not belong to this project.`
      );
    }
    assets.set(reference.assetId, asset);
  }

  if (LOCAL_MODELS.includes(generation.modelId)) {
    for (const asset of assets.values()) {
      if (asset.storageProvider !== 'local')
        throw new Error(
          'Import the reference into local project storage first.'
        );
      await stat(resolveLocalProjectAssetPath({ objectKey: asset.objectKey }));
    }
    return {
      generation: {
        ...generation,
        references: generation.references.map((ref) => ({
          ...ref,
          deliveryUrl: assets.get(ref.assetId)!.publicUrl,
        })),
      },
      authorizedDeliveryUrls: [...assets.values()].map(
        (asset) => asset.publicUrl
      ),
    };
  }
  const localAssets = [...assets.values()].filter(
    needsManagedGenerationReferenceUpload
  );
  const deliveryUrls = new Map<string, string>();
  for (const asset of assets.values()) {
    const providerUrl = getProviderGenerationAssetUrl(asset);
    if (providerUrl) deliveryUrls.set(asset.id, providerUrl);
  }
  for (const asset of localAssets) {
    if (asset.storageProvider !== 'local') {
      throw new Error(
        `Asset ${asset.id} does not have a public delivery URL or a readable local file.`
      );
    }
    const filePath = resolveLocalProjectAssetPath({
      objectKey: asset.objectKey,
    });
    const fileInfo = await stat(filePath);
    if (!fileInfo.isFile()) {
      throw new Error(`Local file for asset ${asset.id} is unavailable.`);
    }
    const slotId = await claimGenerationUploadSlot({
      intentId,
      projectId: generation.projectId,
    });
    if (!slotId) {
      throw new Error('Generation upload authorization is invalid or expired.');
    }
    try {
      const contentType = getReferenceContentType(asset);
      const bytes = await readFile(filePath);
      const body = new Blob([bytes], { type: contentType });
      const uploaded = await uploadManagedGenerationInput({
        body,
        filename: asset.filename || `${asset.id}.${asset.type}`,
        contentType,
      });
      const completed = await completeGenerationUploadSlot({
        intentId,
        upload: {
          slotId,
          provider: uploaded.provider,
          bucket: uploaded.bucket,
          key: uploaded.key,
          url: uploaded.url,
          filename: asset.filename || `${asset.id}.${asset.type}`,
          mimeType: contentType,
          sizeBytes: body.size,
        },
      });
      if (!completed) {
        throw new Error(
          'Generation upload authorization expired before completion.'
        );
      }
      deliveryUrls.set(asset.id, uploaded.url);
    } catch (error) {
      await releaseGenerationUploadSlot({ intentId, slotId }).catch(
        () => undefined
      );
      throw error;
    }
  }

  return {
    generation: {
      ...generation,
      references: generation.references.map((reference) => ({
        ...reference,
        ...(deliveryUrls.has(reference.assetId)
          ? { deliveryUrl: deliveryUrls.get(reference.assetId) }
          : {}),
      })),
    },
    authorizedDeliveryUrls: [...deliveryUrls.values()],
  };
}

export async function preflightAssetFirstGeneration(source: unknown) {
  let generation = normalizeAssetFirstGenerationRequest(source);
  const reviewedSourceGeneration = generation;
  const sourceContext = generation.sourceCardId
    ? await assertCanvasGenerationSource(
        generation.projectId,
        generation.sourceCardId,
        generation
      )
    : undefined;
  if (sourceContext)
    generation = {
      ...generation,
      references: sourceContext.references,
      parameters: sourceContext.parameters,
    };
  if (['local-h3-ref2va', 'local-flux3-klein'].includes(generation.modelId)) {
    const seen = new Set<string>();
    generation = {
      ...generation,
      references: generation.references.filter((ref) => {
        if (seen.has(ref.assetId)) return false;
        seen.add(ref.assetId);
        return true;
      }),
    };
  }
  const originalPrompt = generation.prompt;
  if (generation.textReferences?.length) {
    const state = await loadProjectWithLatestSnapshot({
      projectId: generation.projectId,
    });
    const cards = Object.fromEntries(
      (state?.snapshot.cards ?? []).map((card) => [card.id, card])
    );
    for (const reference of generation.textReferences) {
      if (cards[reference.cardId]?.kind !== 'text')
        throw new Error('Text reference does not belong to this project.');
    }
    const resolved = resolveCanvasTextReferences({
      cards,
      referenceCardIds: generation.textReferences.map((ref) => ref.cardId),
      prompt: originalPrompt,
    });
    if (
      JSON.stringify(resolved.textReferences) !==
      JSON.stringify(generation.textReferences)
    )
      throw new Error(
        'Referenced text changed. Review the text node and submit again.'
      );
    generation = { ...generation, prompt: resolved.resolvedPrompt };
  }
  const project = await getProject({ projectId: generation.projectId });
  if (!project || project.status !== 'active')
    throw new Error('Project not found');
  const provider = getActiveGenerationProvider();
  const binding = getGenerationModelBinding({
    modelId: generation.modelId,
    providerId: provider.id,
  });
  if (!binding) {
    throw new Error(
      `Model ${generation.modelId} is not available from ${provider.label}.`
    );
  }
  const descriptor = getGenerationModelDescriptor(generation.modelId);
  if (!descriptor || descriptor.kind !== generation.mode) {
    throw new Error(
      `Model ${generation.modelId} does not support ${generation.mode} generation.`
    );
  }
  const prompt = validateGenerationPrompt(
    generation.prompt,
    getGenerationPromptConstraints({ modelId: generation.modelId })
  );
  if (!prompt.ok)
    throw new Error(
      prompt.code === 'PROMPT_TOO_LONG'
        ? `Prompt must be ${prompt.maxChars} characters or fewer.`
        : 'Prompt is required.'
    );
  const uniqueAssets = new Map<
    string,
    Awaited<ReturnType<typeof getProjectAssetById>>
  >();
  for (const reference of generation.references) {
    if (!uniqueAssets.has(reference.assetId)) {
      uniqueAssets.set(
        reference.assetId,
        await getProjectAssetById({
          projectId: generation.projectId,
          assetId: reference.assetId,
        })
      );
    }
  }
  const expectedUploadCount = LOCAL_MODELS.includes(generation.modelId)
    ? 0
    : [...uniqueAssets.values()].filter(
        (asset) => asset && needsManagedGenerationReferenceUpload(asset)
      ).length;
  const validationUrls: string[] = [];
  for (const [assetId, asset] of uniqueAssets) {
    if (!asset)
      throw new Error(`Asset ${assetId} does not belong to this project.`);
    if (
      ['local-h3-ref2va', 'local-flux3-klein', 'local-drama3'].includes(
        generation.modelId
      )
    ) {
      if (generation.modelId === 'local-flux3-klein' && asset.type !== 'image')
        throw new Error('Local FLUX 3 accepts image references only.');
      if (generation.modelId === 'local-drama3' && asset.type !== 'audio')
        throw new Error('Local Drama 3 accepts audio references only.');
      if (asset.storageProvider !== 'local')
        throw new Error(
          'Import local model references into local project storage first.'
        );
      const file = await stat(
        resolveLocalProjectAssetPath({ objectKey: asset.objectKey })
      );
      const candidate = {
        name: asset.filename ?? '',
        type: asset.mimeType ?? '',
        size: file.size,
      };
      const valid =
        asset.type === 'image'
          ? validateUploadedImageFile(candidate)
          : asset.type === 'video'
            ? validateUploadedVideoFile(candidate)
            : validateUploadedAudioFile(candidate);
      if (!valid.ok)
        throw new Error('Local model reference type or size is not supported.');
      if (
        generation.references.some(
          (ref) => ref.assetId === assetId && ref.role === 'audio_track'
        ) &&
        asset.type !== 'audio'
      )
        throw new Error('An audio_track reference must be an audio asset.');
    }
    if (needsManagedGenerationReferenceUpload(asset)) {
      if (asset.storageProvider !== 'local')
        throw new Error(`Asset ${assetId} is unavailable.`);
      const file = await stat(
        resolveLocalProjectAssetPath({ objectKey: asset.objectKey })
      );
      if (!file.isFile())
        throw new Error(`Local file for asset ${assetId} is unavailable.`);
    }
  }
  // Validation uses inert URLs; no file leaves the workspace during preflight.
  const validationRequest = {
    ...generation,
    references: generation.references.map((reference, index) => {
      const asset = uniqueAssets.get(reference.assetId)!;
      const extension =
        asset.type === 'video' ? 'mp4' : asset.type === 'audio' ? 'mp3' : 'png';
      const deliveryUrl = `https://validation.invalid/reference-${index}.${extension}`;
      validationUrls.push(deliveryUrl);
      return { ...reference, deliveryUrl };
    }),
  };
  const input = await compileAssetFirstGenerationInput({
    generation: validationRequest,
    generationIntentId: '',
    authorizedDeliveryUrls: validationUrls,
  });
  validateGenerationModelInput({ modelId: generation.modelId, input });
  await provider.assertConfigured?.(
    getRegisteredEffectById(binding.effectId) ?? undefined
  );
  return {
    generation,
    binding,
    expectedUploadCount,
    originalPrompt,
    sourceContext,
    reviewedSourceGeneration,
  };
}

export async function createAssetFirstGenerationIntent(source: unknown) {
  const prepared = await preflightAssetFirstGeneration(source);
  return issueGenerationUploadIntent({
    projectId: prepared.generation.projectId,
    effectId: prepared.binding.effectId,
    expectedUploadCount: prepared.expectedUploadCount,
    ...(prepared.sourceContext
      ? {
          sourceCardId: prepared.sourceContext.sourceCardId,
          sourceContextDigest: prepared.sourceContext.sourceContextDigest,
        }
      : {}),
  });
}

export async function submitAssetFirstGeneration({
  generation: source,
  origin,
  generationIntentId,
}: {
  generation: AssetFirstGenerationRequest | unknown;
  origin: 'ui' | 'mcp' | 'cli' | 'system';
  generationIntentId?: string;
}) {
  const {
    generation,
    binding,
    expectedUploadCount,
    originalPrompt,
    sourceContext,
    reviewedSourceGeneration,
  } = await preflightAssetFirstGeneration(source);
  const intentId =
    generationIntentId ||
    (await issueGenerationUploadIntent({
      projectId: generation.projectId,
      effectId: binding.effectId,
      expectedUploadCount,
      ...(sourceContext
        ? {
            sourceCardId: sourceContext.sourceCardId,
            sourceContextDigest: sourceContext.sourceContextDigest,
          }
        : {}),
    }));
  if (
    (await getGenerationUploadIntentEffectId({
      intentId,
      projectId: generation.projectId,
    })) !== binding.effectId
  ) {
    throw new Error(
      'Generation authorization does not match this project and model.'
    );
  }
  const reviewedIntent = await getGenerationUploadIntentSourceContext({
    intentId,
    projectId: generation.projectId,
  });
  if (
    (reviewedIntent?.sourceCardId ?? null) !==
      (sourceContext?.sourceCardId ?? null) ||
    (reviewedIntent?.sourceContextDigest ?? null) !==
      (sourceContext?.sourceContextDigest ?? null)
  )
    throw new Error(
      'Canvas generation configuration or bindings changed after precheck; review and precheck again.'
    );
  try {
    const prepared = await prepareGenerationReferences({
      generation,
      intentId,
    });
    const input = await compileAssetFirstGenerationInput({
      generation: prepared.generation,
      generationIntentId: intentId,
      authorizedDeliveryUrls: prepared.authorizedDeliveryUrls,
    });
    if (LOCAL_MODELS.includes(generation.modelId)) {
      const paths = [];
      const references = [];
      const seenAssets = new Set<string>();
      for (const ref of generation.references) {
        if (seenAssets.has(ref.assetId)) continue;
        seenAssets.add(ref.assetId);
        const asset = await getProjectAssetById({
          projectId: generation.projectId,
          assetId: ref.assetId,
        });
        if (!asset || asset.storageProvider !== 'local')
          throw new Error('Local reference unavailable');
        const path = resolveLocalProjectAssetPath({
          objectKey: asset.objectKey,
        });
        paths.push(path);
        references.push({ assetId: asset.id, type: asset.type, path });
      }
      Object.assign(input, { _localReferencePaths: paths });
      if (
        ['local-h3-ref2va', 'local-flux3-klein', 'local-drama3'].includes(
          generation.modelId
        )
      )
        Object.assign(input, { _localReferences: references });
    }
    validateGenerationModelInput({ modelId: generation.modelId, input });
    if (sourceContext) {
      const latest = await assertCanvasGenerationSource(
        generation.projectId,
        sourceContext.sourceCardId,
        reviewedSourceGeneration
      );
      if (latest.sourceContextDigest !== sourceContext.sourceContextDigest)
        throw new Error(
          'Canvas generation configuration or bindings changed before submission; review and precheck again.'
        );
    }
    const result = await submitEffectGeneration({
      effectId: binding.effectId,
      input,
      projectId: generation.projectId,
      generationIntentId: intentId,
      authorizedReferenceUrls: prepared.authorizedDeliveryUrls,
      metadata: {
        origin,
        requestVersion: generation.version,
        logicalModelId: generation.modelId,
        ...(sourceContext
          ? {
              canvasSource: sourceContext.provenance,
              sourceContextDigest: sourceContext.sourceContextDigest,
            }
          : {}),
        ...(generation.textReferences?.length
          ? { originalPrompt, textReferences: generation.textReferences }
          : {}),
      },
    });
    const generationId =
      typeof result.body.wmTaskId === 'string' ? result.body.wmTaskId : null;
    if (result.status < 400 && generationId) {
      for (const assetId of new Set(
        generation.references.map((reference) => reference.assetId)
      )) {
        await linkGenerationAsset({
          generationId,
          assetId,
          role: 'input',
        });
      }
    }
    return result;
  } catch (error) {
    await failGenerationUploadIntent({ intentId });
    throw error;
  }
}
