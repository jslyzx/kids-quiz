import { Body, BadRequestException, Controller, Post } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname, resolve } from 'node:path';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MIME_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

type UploadImageBody = {
  fileName?: string;
  mimeType?: string;
  dataUrl?: string;
  base64?: string;
};

function uploadRoot() {
  return resolve(process.env.UPLOAD_DIR ?? resolve(process.cwd(), 'uploads'));
}

function parseImage(body: UploadImageBody) {
  const fromDataUrl = /^data:([^;]+);base64,(.+)$/i.exec(body.dataUrl ?? '');
  const mimeType = (fromDataUrl?.[1] ?? body.mimeType ?? '').toLowerCase();
  const base64 = fromDataUrl?.[2] ?? body.base64 ?? '';
  if (!MIME_EXT[mimeType]) throw new BadRequestException('只支持 png、jpg、webp、gif 图片');
  if (!base64) throw new BadRequestException('缺少图片内容');
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) throw new BadRequestException('图片内容为空');
  if (buffer.byteLength > MAX_IMAGE_BYTES) throw new BadRequestException('图片不能超过 10MB');
  return { mimeType, buffer };
}

@Controller('admin/uploads')
export class UploadsController {
  @Post('image')
  async uploadImage(@Body() body: UploadImageBody) {
    const { mimeType, buffer } = parseImage(body ?? {});
    const originalExt = extname(body.fileName ?? '').toLowerCase();
    const ext = Object.values(MIME_EXT).includes(originalExt) ? originalExt : MIME_EXT[mimeType];
    const dir = uploadRoot();
    await mkdir(dir, { recursive: true });
    const fileName = `${Date.now()}-${randomUUID()}${ext}`;
    await writeFile(resolve(dir, fileName), buffer);
    const baseUrl = process.env.PUBLIC_API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
    return { url: `${baseUrl}/uploads/${fileName}`, path: `/uploads/${fileName}` };
  }
}
