import { UnauthorizedException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import _ from 'lodash';
import { join } from 'node:path';
import { OnEvent, OnJob } from 'src/decorators';
import { PluginManifestDto } from 'src/dtos/plugin-manifest.dto';
import {
  BootstrapEventPriority,
  DatabaseLock,
  ImmichWorker,
  JobName,
  JobStatus,
  QueueName,
  WorkflowTrigger,
  WorkflowType,
} from 'src/enum';
import { ArgOf } from 'src/repositories/event.repository';
import { BaseService } from 'src/services/base.service';
import { JobOf, WorkflowEventData, WorkflowEventPayload, WorkflowResponse } from 'src/types';

type ExecuteOptions<T extends WorkflowType = any> = {
  read: (type: T) => Promise<WorkflowEventData<T>>;
  write: (changes: Partial<WorkflowEventData<T>>) => Promise<void>;
};

export class WorkflowExecutionService extends BaseService {
  private jwtSecret!: string;

  @OnEvent({ name: 'AppBootstrap', priority: BootstrapEventPriority.PluginSync, workers: [ImmichWorker.Microservices] })
  async onPluginSync() {
    await this.databaseRepository.withLock(DatabaseLock.PluginImport, async () => {
      // TODO avoid importing plugins in each worker
      // Can this use system metadata similar to geocoding?

      const { resourcePaths, plugins } = this.configRepository.getEnv();
      await this.importFolder(resourcePaths.corePlugin, { force: true });

      if (plugins.external.allow && plugins.external.installFolder) {
        await this.importFolders(plugins.external.installFolder);
      }
    });
  }

  @OnEvent({ name: 'AppBootstrap', priority: BootstrapEventPriority.PluginLoad, workers: [ImmichWorker.Microservices] })
  async onPluginLoad() {
    this.jwtSecret = this.cryptoRepository.randomBytesAsText(32);

    const plugins = await this.pluginRepository.getForLoad();
    for (const plugin of plugins) {
      try {
        await this.pluginRepository.load(plugin, {
          functions: {
            addAssetToAlbum: () => {
              return 0;
            },
          },
        });

        this.logger.log(`Successfully loaded plugin: ${plugin.name}`);
      } catch (error) {
        this.logger.error(`Failed to load plugin ${plugin.name}:`, error);
      }
    }
  }

  private async importFolders(installFolder: string): Promise<void> {
    try {
      const entries = await this.storageRepository.readdirWithTypes(installFolder);
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        await this.importFolder(join(installFolder, entry.name));
      }
    } catch (error) {
      this.logger.error(`Failed to import plugins folder ${installFolder}:`, error);
    }
  }

  private async importFolder(folder: string, options?: { force?: boolean }) {
    try {
      const manifestPath = join(folder, 'manifest.json');
      const dto = await this.storageRepository.readJsonFile(manifestPath);
      const manifest = plainToInstance(PluginManifestDto, dto);
      const errors = await validate(manifest, { whitelist: true, forbidNonWhitelisted: true });
      if (errors.length > 0) {
        this.logger.warn(`Invalid plugin manifest at ${manifestPath}:\n${errors.map((e) => e.toString()).join('\n')}`);
        return;
      }

      const existing = await this.pluginRepository.getByName(manifest.name);
      if (existing && existing.version === manifest.version && options?.force !== true) {
        return;
      }

      const wasmPath = `${folder}/${manifest.wasmPath}`;
      const wasmBytes = await this.storageRepository.readFile(wasmPath);

      const plugin = await this.pluginRepository.create(
        {
          enabled: true,
          name: manifest.name,
          title: manifest.title,
          description: manifest.description,
          author: manifest.author,
          version: manifest.version,
          wasmBytes,
        },
        manifest.methods.map((method) => ({
          name: method.name,
          title: method.title,
          description: method.description,
          types: method.types,
          schema: method.schema,
        })),
      );

      if (existing) {
        this.logger.log(
          `Upgraded plugin ${manifest.name} (${plugin.methods.length} methods) from ${existing.version} to ${manifest.version} `,
        );
      } else {
        this.logger.log(
          `Imported plugin ${manifest.name}@${manifest.version} (${plugin.methods.length} methods) from ${folder}`,
        );
      }

      return manifest;
    } catch {
      this.logger.warn(`Failed to import plugin from ${folder}:`);
    }
  }

  /**
   * Validates the JWT token and returns the auth context.
   */
  private validateToken(authToken: string): { userId: string } {
    try {
      const auth = this.cryptoRepository.verifyJwt<{ userId: string }>(authToken, this.jwtSecret);
      if (!auth.userId) {
        throw new UnauthorizedException('Invalid token: missing userId');
      }
      return auth;
    } catch (error) {
      this.logger.error('Token validation failed:', error);
      throw new UnauthorizedException('Invalid token');
    }
  }

  @OnEvent({ name: 'AssetCreate' })
  async onAssetCreate({ asset }: ArgOf<'AssetCreate'>) {
    const dto = { ownerId: asset.ownerId, trigger: WorkflowTrigger.AssetCreate };
    const items = await this.workflowRepository.search(dto);
    await this.jobRepository.queueAll(
      items.map((workflow) => ({
        name: JobName.WorkflowAssetCreate,
        data: { workflowId: workflow.id, assetId: asset.id },
      })),
    );
  }

  @OnJob({ name: JobName.WorkflowAssetCreate, queue: QueueName.Workflow })
  async handleWorkflowAssetCreate({ workflowId, assetId }: JobOf<JobName.WorkflowAssetCreate>) {
    await this.execute(workflowId, (type: WorkflowType) => {
      switch (type) {
        case WorkflowType.AssetV1: {
          return <ExecuteOptions<WorkflowType.AssetV1>>{
            read: async () => {
              const asset = await this.workflowRepository.getForAssetV1(assetId);
              return { asset };
            },
            write: async (changes) => {
              if (changes.asset) {
                await this.assetRepository.update({
                  id: assetId,
                  ..._.omitBy(
                    {
                      isFavorite: changes.asset?.isFavorite,
                      visibility: changes.asset?.visibility,
                    },
                    _.isUndefined,
                  ),
                });
              }
            },
          };
        }
      }
    });
  }

  private async execute(workflowId: string, getHandler: (type: WorkflowType) => ExecuteOptions | undefined) {
    const workflow = await this.workflowRepository.getForWorkflowRun(workflowId);
    if (!workflow) {
      return;
    }

    // TODO infer from steps
    const type = 'AssetV1' as WorkflowType;
    const handler = getHandler(type);
    if (!handler) {
      this.logger.error(`Misconfigured workflow ${workflowId}: no handler for type ${type}`);
      return;
    }

    try {
      const { read, write } = handler;
      let data = await read(type);
      for (const step of workflow.steps) {
        const payload: WorkflowEventPayload = {
          trigger: workflow.trigger,
          type,
          config: step.config ?? {},
          workflow: {
            id: workflowId,
            stepId: step.id,
          },
          data,
        };

        const result = await this.pluginRepository.callMethod<WorkflowResponse>(step, payload);
        if (result?.changes) {
          await write(result.changes);
          data = await read(type);
        }

        const shouldContinue = result?.workflow?.continue ?? true;
        if (!shouldContinue) {
          break;
        }
      }

      this.logger.debug(`Workflow ${workflowId} executed successfully`);
    } catch (error) {
      this.logger.error(`Error executing workflow ${workflowId}:`, error);
      return JobStatus.Failed;
    }
  }
}
