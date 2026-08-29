import { RoleName } from '@prisma/client';
import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { adminAccountingService } from './admin-accounting.service.js';
import type {
  AccountLedgerQuery,
  ChartQuery,
  CreateAccountInput,
  DayBookQueryInput,
  FinanceSettingsInput,
  ManualJournalInput,
  ReverseEntryInput,
  RunProjectionInput,
  UpdateAccountInput,
} from './admin-accounting.validation.js';

const isSuperAdmin = (req: Request): boolean => req.user?.role === RoleName.SUPER_ADMIN;

export class AdminAccountingController {
  chart = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(res, await adminAccountingService.chartOfAccounts(req.validatedQuery as ChartQuery));
  });

  createAccount = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminAccountingService.createAccount(req.body as CreateAccountInput);
    return ApiResponse.created(res, result, 'Account created');
  });

  updateAccount = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminAccountingService.updateAccount(
      req.params['id'] as string,
      req.body as UpdateAccountInput,
    );
    return ApiResponse.success(res, result, 'Account updated');
  });

  reseedChart = asyncHandler(async (_req: Request, res: Response) => {
    return ApiResponse.success(res, await adminAccountingService.reseedChart(), 'Chart of accounts refreshed');
  });

  dayBook = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminAccountingService.dayBook(req.validatedQuery as DayBookQueryInput);
    return ApiResponse.success(res, result, 'Day book', 200, result.meta);
  });

  journalEntry = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(res, await adminAccountingService.journalEntry(req.params['id'] as string));
  });

  accountLedger = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminAccountingService.accountLedger(
      req.params['id'] as string,
      req.validatedQuery as AccountLedgerQuery,
    );
    return ApiResponse.success(res, result, 'Account ledger', 200, result.meta);
  });

  postManualJournal = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminAccountingService.postManualJournal(
      req.body as ManualJournalInput,
      req.user!.id,
      isSuperAdmin(req),
    );
    return ApiResponse.created(res, result, 'Journal entry posted');
  });

  reverseEntry = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminAccountingService.reverseEntry(
      req.params['id'] as string,
      req.body as ReverseEntryInput,
      req.user!.id,
      isSuperAdmin(req),
    );
    return ApiResponse.success(res, result, 'Entry reversed');
  });

  fiscalYears = asyncHandler(async (_req: Request, res: Response) => {
    await adminAccountingService.ensureCurrentYear();
    return ApiResponse.success(res, await adminAccountingService.fiscalYears());
  });

  setPeriodStatus = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { status: never; notes?: string };
    const result = await adminAccountingService.setPeriodStatus(
      req.params['id'] as string,
      body.status,
      req.user!.id,
      body.notes,
    );
    return ApiResponse.success(res, result, 'Period updated');
  });

  getSettings = asyncHandler(async (_req: Request, res: Response) => {
    return ApiResponse.success(res, await adminAccountingService.getSettings());
  });

  updateSettings = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminAccountingService.updateSettings(req.body as FinanceSettingsInput, req.user!.id);
    return ApiResponse.success(res, result, 'Finance settings updated');
  });

  runProjection = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminAccountingService.runProjection(req.body as RunProjectionInput, req.user!.id);
    return ApiResponse.success(res, result, 'Ledger sync complete');
  });

  projectionHistory = asyncHandler(async (_req: Request, res: Response) => {
    return ApiResponse.success(res, await adminAccountingService.projectionHistory());
  });
}

export const adminAccountingController = new AdminAccountingController();
