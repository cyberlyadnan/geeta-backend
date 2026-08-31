import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { adminDeliveryService } from './admin-delivery.service.js';
import type {
  AssignInput,
  CancelAssignmentInput,
  CreateServiceInput,
  DeliveryStatsQuery,
  ListAgentsQuery,
  ListAssignmentsQuery,
  ListServicesQuery,
  RerouteInput,
  SetAgentServicesInput,
  SetVendorServicesInput,
  UpdateServiceInput,
} from './admin-delivery.validation.js';

export class AdminDeliveryController {
  listServices = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminDeliveryService.listServices(req.validatedQuery as ListServicesQuery);
    return ApiResponse.success(res, result);
  });

  createService = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminDeliveryService.createService(
      req.body as CreateServiceInput,
      req.user!.id,
    );
    return ApiResponse.success(res, result, 'Delivery service created', 201);
  });

  updateService = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminDeliveryService.updateService(
      req.params['id'] as string,
      req.body as UpdateServiceInput,
    );
    return ApiResponse.success(res, result, 'Delivery service updated');
  });

  listAgents = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminDeliveryService.listAgents(req.validatedQuery as ListAgentsQuery);
    return ApiResponse.success(res, result);
  });

  setAgentServices = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminDeliveryService.setAgentServices(
      req.params['id'] as string,
      req.body as SetAgentServicesInput,
      req.user!.id,
    );
    return ApiResponse.success(res, result, 'Services updated');
  });

  getVendorServices = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminDeliveryService.getVendorServices(req.params['id'] as string);
    return ApiResponse.success(res, result);
  });

  setVendorServices = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminDeliveryService.setVendorServices(
      req.params['id'] as string,
      req.body as SetVendorServicesInput,
    );
    return ApiResponse.success(res, result, 'Delivery services updated');
  });

  listAssignments = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminDeliveryService.listAssignments(
      req.validatedQuery as ListAssignmentsQuery,
    );
    return ApiResponse.success(res, result, 'Consignments', 200, result.meta);
  });

  getAssignment = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminDeliveryService.getAssignment(req.params['id'] as string);
    return ApiResponse.success(res, result);
  });

  assign = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminDeliveryService.assign(
      req.params['id'] as string,
      req.body as AssignInput,
      req.user!.id,
    );
    return ApiResponse.success(res, result, 'Consignment assigned');
  });

  reroute = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminDeliveryService.reroute(
      req.params['id'] as string,
      req.body as RerouteInput,
      req.user!.id,
    );
    return ApiResponse.success(res, result, 'Consignment rerouted');
  });

  cancel = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminDeliveryService.cancel(
      req.params['id'] as string,
      req.body as CancelAssignmentInput,
    );
    return ApiResponse.success(res, result, 'Consignment cancelled');
  });

  listUnrouted = asyncHandler(async (_req: Request, res: Response) => {
    return ApiResponse.success(res, await adminDeliveryService.listUnrouted());
  });

  routeUnrouted = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { batchId: string; deliveryServiceId: string };
    const result = await adminDeliveryService.routeUnroutedBatch(
      body.batchId,
      body.deliveryServiceId,
      req.user!.id,
    );
    return ApiResponse.success(res, result, 'Consignment placed');
  });

  stats = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminDeliveryService.stats(req.validatedQuery as DeliveryStatsQuery);
    return ApiResponse.success(res, result);
  });
}

export const adminDeliveryController = new AdminDeliveryController();
