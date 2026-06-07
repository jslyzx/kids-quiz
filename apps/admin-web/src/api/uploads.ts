import { request } from './client';

type UploadImageResult = { url: string; path: string };

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

export async function uploadImage(file: File): Promise<UploadImageResult> {
  const dataUrl = await fileToDataUrl(file);
  return request<UploadImageResult>('/admin/uploads/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, mimeType: file.type, dataUrl }),
  });
}
