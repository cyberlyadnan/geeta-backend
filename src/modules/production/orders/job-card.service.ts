import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export type JobCardPayload = {
  orderNumber: string;
  jobCardNumber: string | null;
  vendor: string;
  product: string;
  quantity: number;
  status: string;
  currentStage: string | null;
  operator: string | null;
  machine: { machineCode: string; machineName: string } | null;
  priority: string | null;
  dueDate: string | null;
  expectedCompletionAt: string | null;
  workflowSteps: Array<{ stepName: string; status: string }>;
  instructions: string | null;
  specialNotes: string | null;
  qrPayload: string;
  generatedAt: string;
};

export async function buildJobCardPdf(data: JobCardPayload): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = 800;
  const draw = (text: string, bold = false, size = 11) => {
    page.drawText(text.slice(0, 90), {
      x: 40,
      y,
      size,
      font: bold ? fontBold : font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= size + 8;
  };

  draw('GEETA PRINT — PRODUCTION JOB CARD', true, 16);
  y -= 4;
  draw(`Order: ${data.orderNumber}`, true, 13);
  if (data.jobCardNumber) draw(`Job Card: ${data.jobCardNumber}`);
  draw(`Vendor: ${data.vendor}`);
  draw(`Product: ${data.product} × ${data.quantity}`);
  draw(`Status: ${data.status}`);
  if (data.currentStage) draw(`Current Stage: ${data.currentStage}`);
  if (data.operator) draw(`Operator: ${data.operator}`);
  if (data.machine) draw(`Machine: ${data.machine.machineCode} · ${data.machine.machineName}`);
  if (data.priority) draw(`Priority: ${data.priority}`);
  if (data.dueDate) draw(`Due: ${new Date(data.dueDate).toLocaleString()}`);
  if (data.expectedCompletionAt) {
    draw(`Expected Completion: ${new Date(data.expectedCompletionAt).toLocaleString()}`);
  }
  y -= 8;
  draw('Workflow', true, 12);
  for (const step of data.workflowSteps) {
    draw(`  • ${step.stepName} — ${step.status}`);
  }
  if (data.instructions) {
    y -= 8;
    draw('Instructions', true, 12);
    for (const line of data.instructions.split('\n').slice(0, 8)) {
      draw(`  ${line}`);
    }
  }
  if (data.specialNotes) {
    y -= 8;
    draw('Special Notes', true, 12);
    for (const line of data.specialNotes.split('\n').slice(0, 6)) {
      draw(`  ${line}`);
    }
  }
  y -= 12;
  draw(`QR Reference: ${data.qrPayload}`, false, 10);
  draw(`Generated: ${new Date(data.generatedAt).toLocaleString()}`, false, 9);

  return pdf.save();
}
