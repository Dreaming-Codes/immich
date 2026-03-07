import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
import { createZoomImageWheel } from '@zoom-image/core';

export const zoomImageAction = (
  node: HTMLElement,
  options?: { disablePointer?: boolean; zoomTarget?: HTMLElement },
) => {
  const zoomInstance = createZoomImageWheel(node, {
    maxZoom: 10,
    initialState: assetViewerManager.zoomState,
    zoomTarget: options?.zoomTarget,
  });

  const unsubscribes = [
    assetViewerManager.on({ ZoomChange: (state) => zoomInstance.setState(state) }),
    zoomInstance.subscribe(({ state }) => assetViewerManager.onZoomChange(state)),
  ];

  const stopPointerIfDisabled = (event: Event) => {
    if (options?.disablePointer) {
      event.stopImmediatePropagation();
    }
  };

  node.addEventListener('pointerdown', stopPointerIfDisabled, { capture: true });

  node.style.overflow = 'visible';
  return {
    update(newOptions?: { disablePointer?: boolean; zoomTarget?: HTMLElement }) {
      options = newOptions;
      if (newOptions?.zoomTarget !== undefined) {
        zoomInstance.setState({ zoomTarget: newOptions.zoomTarget });
      }
    },
    destroy() {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
      node.removeEventListener('pointerdown', stopPointerIfDisabled, { capture: true });
      zoomInstance.cleanup();
    },
  };
};
