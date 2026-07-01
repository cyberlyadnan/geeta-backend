import { redisCache } from '../../common/cache/redis-cache.js';
import type { WorkflowTemplateWithSteps } from './workflow.repository.js';

const PREFIX = 'workflow:template:';
const TTL_SEC = 300;

export const WorkflowCacheKeys = {
  templateById: (id: string) => `${PREFIX}id:${id}`,
  templateByProductVersion: (versionId: string) => `${PREFIX}product-version:${versionId}`,
};

export class WorkflowTemplateCache {
  async getTemplateByProductVersion(
    productOfferingVersionId: string,
    loader: () => Promise<WorkflowTemplateWithSteps>,
  ): Promise<WorkflowTemplateWithSteps> {
    return redisCache.getOrLoad(
      WorkflowCacheKeys.templateByProductVersion(productOfferingVersionId),
      TTL_SEC,
      loader,
    );
  }

  async invalidateTemplate(templateId: string): Promise<void> {
    await redisCache.del(WorkflowCacheKeys.templateById(templateId));
    await redisCache.delByPrefix(PREFIX);
  }
}

export const workflowTemplateCache = new WorkflowTemplateCache();
