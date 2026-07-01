import type { RoleName } from '@prisma/client';
import { ApiError } from '../../../common/errors/ApiError.js';
import { assertCanViewControlCenter } from './control-center.access.js';
import { controlCenterCache } from './control-center.cache.js';
import {
  mapDepartmentsOverview,
  mapFactoryOverview,
  mapHeatmap,
  mapOrderDrillDown,
  mapTimelineItem,
} from './control-center.dto.js';
import { controlCenterRepository } from './control-center.repository.js';
import type { AlertsQuery, TimelineQuery } from './control-center.validation.js';

export class ControlCenterService {
  async getDashboard(role: RoleName, permissions: string[]) {
    assertCanViewControlCenter(role, permissions);

    return controlCenterCache.getDashboard(async () => {
      const [overview, departments, kpis] = await Promise.all([
        controlCenterRepository.getFactoryOverview(),
        controlCenterRepository.listDepartmentsOverview(),
        controlCenterRepository.getProductionKpis(),
      ]);

      const mappedDepartments = mapDepartmentsOverview(departments);

      return {
        overview: mapFactoryOverview(overview),
        departments: mappedDepartments,
        kpis,
        heatmap: mapHeatmap(mappedDepartments),
        refreshedAt: new Date().toISOString(),
      };
    });
  }

  async getOverview(role: RoleName, permissions: string[]) {
    assertCanViewControlCenter(role, permissions);
    const overview = await controlCenterRepository.getFactoryOverview();
    return mapFactoryOverview(overview);
  }

  async getDepartments(role: RoleName, permissions: string[]) {
    assertCanViewControlCenter(role, permissions);
    const departments = await controlCenterRepository.listDepartmentsOverview();
    return { items: mapDepartmentsOverview(departments) };
  }

  async getKpis(role: RoleName, permissions: string[]) {
    assertCanViewControlCenter(role, permissions);
    return controlCenterRepository.getProductionKpis();
  }

  async getHeatmap(role: RoleName, permissions: string[]) {
    assertCanViewControlCenter(role, permissions);
    const departments = mapDepartmentsOverview(
      await controlCenterRepository.listDepartmentsOverview(),
    );
    return { items: mapHeatmap(departments) };
  }

  async getTimeline(role: RoleName, permissions: string[], query: TimelineQuery) {
    assertCanViewControlCenter(role, permissions);

    return controlCenterCache.getTimeline(query.limit, async () => {
      const rows = await controlCenterRepository.getTimelineFeed(query.limit);
      return {
        items: rows.map(mapTimelineItem),
        refreshedAt: new Date().toISOString(),
      };
    });
  }

  async getAlerts(role: RoleName, permissions: string[], query: AlertsQuery) {
    assertCanViewControlCenter(role, permissions);

    return controlCenterCache.getAlerts(query.limit, async () => {
      const items = await controlCenterRepository.getAlerts(query.limit);
      return {
        items,
        refreshedAt: new Date().toISOString(),
      };
    });
  }

  async getOrderDrillDown(orderId: string, role: RoleName, permissions: string[]) {
    assertCanViewControlCenter(role, permissions);
    const order = await controlCenterRepository.getOrderDrillDown(orderId);
    if (!order) throw ApiError.notFound('Production order not found');
    return mapOrderDrillDown(order);
  }
}

export const controlCenterService = new ControlCenterService();
