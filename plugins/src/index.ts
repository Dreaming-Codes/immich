const { addAssetToAlbum } = Host.getFunctions();

type WorkflowInput<
  TConfig = Record<string, unknown>,
  TData = Record<string, unknown>
> = {
  trigger: string;
  type: string;
  data: TData;
  config: TConfig;
  workflow: {
    id: string;
    stepId: string;
  };
};

type WorkflowOutput = {
  workflow?: {
    /** stop the workflow */
    continue?: boolean;
  };
  changes?: Partial<Record<string, unknown>>;
  /** data to be passed to the next workflow step */
  data?: Record<string, unknown>;
};

type AssetFileFilterConfig = {
  pattern: string;
  matchType?: 'contains' | 'exact' | 'regex';
  caseSensitive?: boolean;
};

const wrapper = <TConfig, TData>(
  fn: (payload: WorkflowInput<TConfig, TData>) => WorkflowOutput | undefined
) => {
  const input = Host.inputString();
  const event = JSON.parse(input) as WorkflowInput<TConfig, TData>;

  console.log(`Event trigger: ${event.trigger}`);
  console.log(`Event type: ${event.type}`);
  console.log(`Event data: ${JSON.stringify(event.data)}`);
  console.log(`Event config: ${JSON.stringify(event.config)}`);

  const response = fn(event) ?? {};

  console.log(`Output workflow: ${JSON.stringify(response.workflow)}`);
  console.log(`Output changes: ${JSON.stringify(response.changes)}`);
  console.log(`Output data: ${JSON.stringify(response.data)}`);

  const output = JSON.stringify(response);
  Host.outputString(output);
};

export function assetFileFilter() {
  return wrapper(({ data, config }) => {
    const {
      pattern,
      matchType = 'contains',
      caseSensitive = false,
    } = config as AssetFileFilterConfig;

    const { asset } = data as {
      asset: { originalFileName: string; fileName: string };
    };

    const fileName = asset.originalFileName || asset.fileName || '';
    const searchName = caseSensitive ? fileName : fileName.toLowerCase();
    const searchPattern = caseSensitive ? pattern : pattern.toLowerCase();

    if (matchType === 'exact') {
      return { workflow: { continue: searchName === searchPattern } };
    }

    if (matchType === 'regex') {
      const flags = caseSensitive ? '' : 'i';
      const regex = new RegExp(searchPattern, flags);
      return { workflow: { continue: regex.test(fileName) } };
    }

    return { workflow: { continue: searchName.includes(searchPattern) } };
  });
}

export const assetArchive = () => {
  wrapper<{ inverse?: boolean }, { asset: { visibility: string } }>(
    ({ config, data }) => {
      const target = config.inverse ? 'timeline' : 'archive';
      if (target !== data.asset.visibility) {
        return {
          changes: {
            asset: { visibility: target },
          },
        };
      }
    }
  );
};

export const assetFavorite = () => {
  wrapper<{ inverse?: boolean }, { asset: { isFavorite: boolean } }>(
    ({ config, data }) => {
      const target = config.inverse ? false : true;
      if (target !== data.asset.isFavorite) {
        return {
          changes: {
            asset: { isFavorite: target },
          },
        };
      }
    }
  );
};

export function assetLock() {
  return wrapper(() => ({ changes: { asset: { visibility: 'locked' } } }));
}

export function assetTrash() {
  return wrapper(() => ({
    changes: {
      asset: { deletedAt: new Date().toISOString(), status: 'trashed' },
    },
  }));
}

// export function actionAddToAlbum() {
//   return wrapper(() => {
//     const albumId = '123';
//     const assetId = '123';
//     const ptr = Memory.fromString(JSON.stringify({ assetId, albumId }));
//     addAssetToAlbum(ptr.offset);
//     ptr.free();
//     return { data: { pleaseNot: 'happening to me' } };
//   });
// }
