import { ApiError } from '../../common/errors/ApiError.js';

export class WorkflowService {
  async findAll(): Promise<unknown[]> {
    // TODO: Implement workflow business logic
    return [];
  }

  async findById(id: string): Promise<unknown> {
    // TODO: Implement workflow findById
    throw ApiError.notFound('Workflow resource not found');
  }
}

export const workflowService = new WorkflowService();
