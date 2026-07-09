import { createCanvas } from '@napi-rs/canvas';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
GlobalWorkerOptions.workerSrc = pathToFileURL(
  require.resolve('pdfjs-dist/build/pdf.worker.mjs'),
).href;

const MAX_PREVIEW_EDGE_PX = 1200;

export async function renderPdfFirstPagePreview(
  pdfBuffer: Buffer,
  maxEdgePx = MAX_PREVIEW_EDGE_PX,
): Promise<Buffer> {
  const loadingTask = getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const scale = Math.min(maxEdgePx / viewport.width, maxEdgePx / viewport.height, 2);
  const scaledViewport = page.getViewport({ scale });

  const canvas = createCanvas(
    Math.ceil(scaledViewport.width),
    Math.ceil(scaledViewport.height),
  );
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas context unavailable');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
      canvasContext: context as never,
      viewport: scaledViewport,
      canvas: canvas as never,
    }).promise;

  const pngBuffer = canvas.toBuffer('image/png');
  return sharp(pngBuffer).webp({ quality: 88 }).toBuffer();
}
