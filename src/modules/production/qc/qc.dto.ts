import type { InspectionRecord } from './qc.repository.js';

function userName(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.trim();
}

export function mapInspectionToDto(record: InspectionRecord) {
  return {
    id: record.id,
    taskId: record.workflowTaskId,
    workflowInstanceId: record.workflowInstanceId,
    inspectorId: record.inspectorId,
    checklistTemplateId: record.checklistTemplateId,
    status: record.status,
    result: record.result,
    remarks: record.remarks,
    reworkCycle: record.reworkCycle,
    startedAt: record.startedAt?.toISOString() ?? null,
    completedAt: record.completedAt?.toISOString() ?? null,
    durationSeconds: record.durationSeconds,
    inspector: {
      id: record.inspector.id,
      name: userName(record.inspector.firstName, record.inspector.lastName),
      email: record.inspector.email,
    },
    items: record.items.map((item) => ({
      id: item.id,
      itemCode: item.itemCode,
      label: item.label,
      passed: item.passed,
      remarks: item.remarks,
    })),
    defects: record.defects.map((d) => ({
      id: d.id,
      category: d.category,
      severity: d.severity,
      description: d.description,
      remarks: d.remarks,
      createdAt: d.createdAt.toISOString(),
      image: d.fileAsset
        ? { id: d.fileAsset.id, name: d.fileAsset.originalName, url: d.fileAsset.fileUrl }
        : null,
    })),
    attachments: record.attachments.map((a) => ({
      id: a.id,
      category: a.category,
      label: a.label,
      createdAt: a.createdAt.toISOString(),
      file: {
        id: a.fileAsset.id,
        name: a.fileAsset.originalName,
        url: a.fileAsset.fileUrl,
        mimeType: a.fileAsset.mimeType,
        size: a.fileAsset.fileSize,
      },
    })),
  };
}
