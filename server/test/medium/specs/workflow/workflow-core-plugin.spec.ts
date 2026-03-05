import { Kysely } from 'kysely';
import { AssetVisibility, WorkflowTrigger } from 'src/enum';
import { AssetRepository } from 'src/repositories/asset.repository';
import { ConfigRepository } from 'src/repositories/config.repository';
import { CryptoRepository } from 'src/repositories/crypto.repository';
import { DatabaseRepository } from 'src/repositories/database.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { PluginRepository } from 'src/repositories/plugin.repository';
import { StorageRepository } from 'src/repositories/storage.repository';
import { WorkflowRepository } from 'src/repositories/workflow.repository';
import { DB } from 'src/schema';
import { WorkflowExecutionService } from 'src/services/workflow-execution.service';
import { WorkflowStepConfig } from 'src/types';
import { MediumTestContext } from 'test/medium.factory';
import { mockEnvData } from 'test/repositories/config.repository.mock';
import { getKyselyDB } from 'test/utils';

let initialized = false;

class WorkflowTestContext extends MediumTestContext<WorkflowExecutionService> {
  constructor(database: Kysely<DB>) {
    super(WorkflowExecutionService, {
      database,
      real: [
        AssetRepository,
        CryptoRepository,
        DatabaseRepository,
        LoggingRepository,
        StorageRepository,
        PluginRepository,
        WorkflowRepository,
      ],
      mock: [ConfigRepository],
    });
  }

  async init() {
    if (initialized) {
      return;
    }

    const mockData = mockEnvData({});
    mockData.resourcePaths.corePlugin = '../plugins';
    mockData.plugins.external.allow = false;
    this.getMock(ConfigRepository).getEnv.mockReturnValue(mockData);

    await this.sut.onPluginSync();
    await this.sut.onPluginLoad();

    initialized = true;
  }
}

type WorkflowTemplate = {
  ownerId: string;
  trigger: WorkflowTrigger;
  steps: WorkflowTemplateStep[];
};

type WorkflowTemplateStep = {
  action: string;
  config?: WorkflowStepConfig;
};

// TODO move this into the service and add support in the API
const createWorkflow = async (template: WorkflowTemplate) => {
  const workflowRepo = ctx.get(WorkflowRepository);
  const pluginRepo = ctx.get(PluginRepository);

  const workflow = await workflowRepo.create({
    enabled: true,
    name: 'Test workflow',
    description: 'A workflow to test the core plugin',
    ownerId: template.ownerId,
    trigger: template.trigger,
  });

  const plugins = await pluginRepo.search({ enabled: true });
  const pluginMethods = plugins.flatMap((plugin) => plugin.methods.map((method) => ({ ...method, plugin })));

  const REF_REGEX = /^(?<name>[^@#\s]+)(?:@(?<version>[^#\s]*))?#(?<method>[^@#\s]+)$/;

  const resolveMethod = (ref: string) => {
    const matches = REF_REGEX.exec(ref);
    const pluginName = matches?.groups?.name;
    const version = matches?.groups?.version;
    const methodName = matches?.groups?.method;

    const method = pluginMethods.find(
      (method) =>
        // same method name
        methodName === method.name &&
        // same plugin name
        pluginName === method.plugin.name &&
        // optional plugin version
        (!version || version === method.plugin.version),
    );
    if (!method) {
      throw new Error(`Plugin method not found: ${pluginName}@${version}#${methodName}`);
    }

    return method;
  };

  const steps = await workflowRepo.replaceSteps(
    workflow.id,
    template.steps.map((step) => ({
      pluginMethodId: resolveMethod(step.action).id,
      config: step.config,
    })),
  );

  return { ...workflow, steps };
};

let ctx: WorkflowTestContext;

beforeAll(async () => {
  const db = await getKyselyDB();
  ctx = new WorkflowTestContext(db);
  await ctx.init();
});

describe('core plugin', () => {
  it('should archive an asset', async () => {
    const { user } = await ctx.newUser();
    const { asset } = await ctx.newAsset({ ownerId: user.id });

    const workflow = await createWorkflow({
      ownerId: user.id,
      trigger: WorkflowTrigger.AssetCreate,
      steps: [{ action: 'immich-core#assetArchive' }],
    });

    await ctx.sut.handleWorkflowAssetCreate({ workflowId: workflow.id, assetId: asset.id });

    await expect(ctx.get(AssetRepository).getById(asset.id)).resolves.toMatchObject({
      visibility: AssetVisibility.Archive,
    });
  });

  it('should unarchive an asset', async () => {
    const { user } = await ctx.newUser();
    const { asset } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Archive });

    const workflow = await createWorkflow({
      ownerId: user.id,
      trigger: WorkflowTrigger.AssetCreate,
      steps: [{ action: 'immich-core#assetArchive', config: { inverse: true } }],
    });

    await ctx.sut.handleWorkflowAssetCreate({ workflowId: workflow.id, assetId: asset.id });

    await expect(ctx.get(AssetRepository).getById(asset.id)).resolves.toMatchObject({
      visibility: AssetVisibility.Timeline,
    });
  });

  it('should favorite an asset', async () => {
    const { user } = await ctx.newUser();
    const { asset } = await ctx.newAsset({ ownerId: user.id });

    const workflow = await createWorkflow({
      ownerId: user.id,
      trigger: WorkflowTrigger.AssetCreate,
      steps: [{ action: 'immich-core#assetFavorite' }],
    });

    await ctx.sut.handleWorkflowAssetCreate({ workflowId: workflow.id, assetId: asset.id });

    await expect(ctx.get(AssetRepository).getById(asset.id)).resolves.toMatchObject({ isFavorite: true });
  });

  it('should unfavorite an asset', async () => {
    const { user } = await ctx.newUser();
    const { asset } = await ctx.newAsset({ ownerId: user.id, isFavorite: true });

    const workflow = await createWorkflow({
      ownerId: user.id,
      trigger: WorkflowTrigger.AssetCreate,
      steps: [{ action: 'immich-core#assetFavorite', config: { inverse: true } }],
    });

    await ctx.sut.handleWorkflowAssetCreate({ workflowId: workflow.id, assetId: asset.id });

    await expect(ctx.get(AssetRepository).getById(asset.id)).resolves.toMatchObject({ isFavorite: false });
  });
});
