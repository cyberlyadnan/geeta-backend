import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import multer from 'multer';
import { MAX_ARTWORK_UPLOAD_BYTES } from '../../../services/storage/storage.types.js';

const uploadDir = path.join(os.tmpdir(), 'geeta-artwork-uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

export const artworkMultipartUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80);
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: MAX_ARTWORK_UPLOAD_BYTES, files: 1 },
});
