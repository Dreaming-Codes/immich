<script lang="ts">
  import { shortcuts } from '$lib/actions/shortcut';
  import { thumbhash } from '$lib/actions/thumbhash';
  import { zoomImageAction } from '$lib/actions/zoom-image';
  import AdaptiveImage from '$lib/components/AdaptiveImage.svelte';
  import FaceEditor from '$lib/components/asset-viewer/face-editor/face-editor.svelte';
  import OcrBoundingBox from '$lib/components/asset-viewer/ocr-bounding-box.svelte';
  import SwipeFeedback from '$lib/components/asset-viewer/swipe-feedback.svelte';
  import AssetViewerEvents from '$lib/components/AssetViewerEvents.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { castManager } from '$lib/managers/cast-manager.svelte';
  import { isFaceEditMode } from '$lib/stores/face-edit.svelte';
  import { ocrManager } from '$lib/stores/ocr.svelte';
  import { boundingBoxesArray, type Faces } from '$lib/stores/people.store';
  import { SlideshowLook, SlideshowState, slideshowStore } from '$lib/stores/slideshow.store';
  import { handlePromiseError } from '$lib/utils';
  import { canCopyImageToClipboard, copyImageToClipboard } from '$lib/utils/asset-utils';
  import { getNaturalSize, scaleToFit, type ContentMetrics } from '$lib/utils/container-utils';
  import { handleError } from '$lib/utils/handle-error';
  import { getOcrBoundingBoxes } from '$lib/utils/ocr-utils';
  import { getBoundingBox } from '$lib/utils/people-utils';
  import { type SharedLinkResponseDto } from '@immich/sdk';
  import { toastManager } from '@immich/ui';
  import { onDestroy, untrack } from 'svelte';
  import { fromAction } from 'svelte/attachments';
  import { t } from 'svelte-i18n';
  import type { AssetCursor } from './asset-viewer.svelte';

  interface Props {
    cursor: AssetCursor;
    element?: HTMLDivElement;
    sharedLink?: SharedLinkResponseDto;
    transitionName?: string;
    onReady?: () => void;
    onError?: () => void;
    onSwipe?: (direction: 'left' | 'right') => void;
  }

  let { cursor, element = $bindable(), sharedLink, transitionName, onReady, onError, onSwipe }: Props = $props();

  const { slideshowState, slideshowLook } = slideshowStore;
  const asset = $derived(cursor.current);

  let visibleImageReady: boolean = $state(false);

  let previousAssetId: string | undefined;
  $effect.pre(() => {
    const id = asset.id;
    if (id === previousAssetId) {
      return;
    }
    previousAssetId = id;
    untrack(() => {
      assetViewerManager.resetZoomState();
      visibleImageReady = false;
      $boundingBoxesArray = [];
    });
  });

  onDestroy(() => {
    $boundingBoxesArray = [];
  });

  let containerWidth = $state(0);
  let containerHeight = $state(0);

  const container = $derived({
    width: containerWidth,
    height: containerHeight,
  });

  const overlayMetrics = $derived.by((): ContentMetrics => {
    if (!assetViewerManager.imgRef || !visibleImageReady) {
      return { contentWidth: 0, contentHeight: 0, offsetX: 0, offsetY: 0 };
    }

    const natural = getNaturalSize(assetViewerManager.imgRef);
    const scaled = scaleToFit(natural, container);
    return {
      contentWidth: scaled.width,
      contentHeight: scaled.height,
      offsetX: 0,
      offsetY: 0,
    };
  });

  const ocrBoxes = $derived(ocrManager.showOverlay ? getOcrBoundingBoxes(ocrManager.data, overlayMetrics) : []);

  const onCopy = async () => {
    if (!canCopyImageToClipboard() || !assetViewerManager.imgRef) {
      return;
    }

    try {
      await copyImageToClipboard(assetViewerManager.imgRef);
      toastManager.info($t('copied_image_to_clipboard'));
    } catch (error) {
      handleError(error, $t('copy_error'));
    }
  };

  const onZoom = () => {
    assetViewerManager.zoom = assetViewerManager.zoom > 1 ? 1 : 2;
  };

  const onPlaySlideshow = () => ($slideshowState = SlideshowState.PlaySlideshow);

  $effect(() => {
    if (isFaceEditMode.value && assetViewerManager.zoom > 1) {
      onZoom();
    }
  });

  // TODO move to action + command palette
  const onCopyShortcut = (event: KeyboardEvent) => {
    if (globalThis.getSelection()?.type === 'Range') {
      return;
    }
    event.preventDefault();

    handlePromiseError(onCopy());
  };

  let currentPreviewUrl = $state<string>();

  const onUrlChange = (url: string) => {
    currentPreviewUrl = url;
  };

  $effect(() => {
    if (currentPreviewUrl) {
      void cast(currentPreviewUrl);
    }
  });

  const cast = async (url: string) => {
    if (!url || !castManager.isCasting) {
      return;
    }
    const fullUrl = new URL(url, globalThis.location.href);

    try {
      await castManager.loadMedia(fullUrl.href);
    } catch (error) {
      handleError(error, 'Unable to cast');
      return;
    }
  };

  const blurredSlideshow = $derived(
    $slideshowState !== SlideshowState.None && $slideshowLook === SlideshowLook.BlurredBackground && !!asset.thumbhash,
  );

  let adaptiveImage = $state<HTMLDivElement | undefined>();

  const faceToNameMap = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const map = new Map<Faces, string>();
    for (const person of asset.people ?? []) {
      for (const face of person.faces ?? []) {
        map.set(face, person.name);
      }
    }
    return map;
  });

  const faces = $derived(Array.from(faceToNameMap.keys()));

  let swipeFeedbackReset = $state<(() => void) | undefined>();
  $effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    asset.id;
    untrack(() => swipeFeedbackReset?.());
  });
</script>

<AssetViewerEvents {onCopy} {onZoom} />

<svelte:document
  use:shortcuts={[
    { shortcut: { key: 'z' }, onShortcut: onZoom, preventDefault: true },
    { shortcut: { key: 's' }, onShortcut: onPlaySlideshow, preventDefault: true },
    { shortcut: { key: 'c', ctrl: true }, onShortcut: onCopyShortcut, preventDefault: false },
    { shortcut: { key: 'c', meta: true }, onShortcut: onCopyShortcut, preventDefault: false },
  ]}
/>

<SwipeFeedback
  bind:element
  class="relative h-full w-full select-none"
  bind:clientWidth={containerWidth}
  bind:clientHeight={containerHeight}
  disabled={!onSwipe || ocrManager.showOverlay || assetViewerManager.zoom > 1}
  disableSwipeLeft={!cursor.nextAsset}
  disableSwipeRight={!cursor.previousAsset}
  bind:reset={swipeFeedbackReset}
  onSwipe={onSwipe ?? (() => {})}
  {@attach fromAction(zoomImageAction, () => ({ disabled: isFaceEditMode.value, zoomTarget: adaptiveImage }))}
>
  <AdaptiveImage
    {asset}
    {sharedLink}
    {container}
    objectFit={$slideshowState !== SlideshowState.None && $slideshowLook === SlideshowLook.Cover ? 'cover' : 'contain'}
    {onUrlChange}
    onImageReady={() => {
      visibleImageReady = true;
      onReady?.();
    }}
    onError={() => {
      onError?.();
      onReady?.();
    }}
    bind:imgRef={assetViewerManager.imgRef}
    bind:ref={adaptiveImage}
    {transitionName}
  >
    {#snippet backdrop()}
      {#if blurredSlideshow}
        <canvas
          use:thumbhash={{ base64ThumbHash: asset.thumbhash! }}
          class="absolute top-0 left-0 inset-s-0 h-dvh w-dvw"
        ></canvas>
      {/if}
    {/snippet}
    {#snippet overlays()}
      {#if !isFaceEditMode.value && !ocrManager.showOverlay}
        {#each getBoundingBox(faces, overlayMetrics) as boundingbox, index (boundingbox.id)}
          <button
            type="button"
            class="absolute pointer-events-auto outline-none"
            style="top: {boundingbox.top}px; left: {boundingbox.left}px; height: {boundingbox.height}px; width: {boundingbox.width}px;"
            aria-label="{$t('person')}: {faceToNameMap.get(faces[index]) || $t('unknown')}"
            onmouseenter={() => ($boundingBoxesArray = [faces[index]])}
            onmouseleave={() => ($boundingBoxesArray = [])}
            onfocus={() => ($boundingBoxesArray = [faces[index]])}
            onblur={() => ($boundingBoxesArray = [])}
          ></button>
        {/each}
      {/if}

      {#each getBoundingBox($boundingBoxesArray, overlayMetrics) as boundingbox, index (boundingbox.id)}
        <div
          class="absolute border-solid border-white border-3 rounded-lg pointer-events-none"
          style="top: {boundingbox.top}px; left: {boundingbox.left}px; height: {boundingbox.height}px; width: {boundingbox.width}px;"
        ></div>
        {#if faceToNameMap.get($boundingBoxesArray[index])}
          <div
            aria-hidden="true"
            class="absolute bg-white/90 text-black px-2 py-1 rounded text-sm font-medium whitespace-nowrap pointer-events-none shadow-lg"
            style="top: {boundingbox.top + boundingbox.height + 4}px; left: {boundingbox.left +
              boundingbox.width}px; transform: translateX(-100%);"
          >
            {faceToNameMap.get($boundingBoxesArray[index])}
          </div>
        {/if}
      {/each}

      {#each ocrBoxes as ocrBox (ocrBox.id)}
        <OcrBoundingBox {ocrBox} />
      {/each}
    {/snippet}
  </AdaptiveImage>

  {#if isFaceEditMode.value && assetViewerManager.imgRef}
    <FaceEditor htmlElement={assetViewerManager.imgRef} {containerWidth} {containerHeight} assetId={asset.id} />
  {/if}

  {#snippet leftPreview()}
    {#if cursor.previousAsset}
      <AdaptiveImage
        asset={cursor.previousAsset}
        {sharedLink}
        {container}
        imageClass="object-contain"
        slideshowState={$slideshowState}
        slideshowLook={$slideshowLook}
      />
    {/if}
  {/snippet}

  {#snippet rightPreview()}
    {#if cursor.nextAsset}
      <AdaptiveImage
        asset={cursor.nextAsset}
        {sharedLink}
        {container}
        imageClass="object-contain"
        slideshowState={$slideshowState}
        slideshowLook={$slideshowLook}
      />
    {/if}
  {/snippet}
</SwipeFeedback>
