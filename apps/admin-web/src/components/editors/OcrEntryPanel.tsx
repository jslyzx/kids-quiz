import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOcrStatus, paddleRecognize, paddleStatus, paddleSubmit, paperCut, type OcrStatus } from '../../api/ocr';
import { useToast } from '../ToastProvider';

/** OCR 识别结果（按图片分组） */
type ImageResult = {
  file: File;
  dataUrl: string;
  status: 'pending' | 'loading' | 'done' | 'error';
  drafts?: any[];
  error?: string;
};

const OCR_STORAGE_KEY = 'kids-quiz-ocr-prefill-drafts';

/** 把 OCR 草稿写入 sessionStorage，供 JSON 导入页读取 */
export function writeOcrPrefill(drafts: any[]) {
  try {
    sessionStorage.setItem(OCR_STORAGE_KEY, JSON.stringify({ drafts, savedAt: Date.now() }));
  } catch {
    // 容量超限时忽略，不影响主流程
  }
}

/** JSON 导入页挂载时读取并清除预填数据 */
export function consumeOcrPrefill(): any[] | null {
  try {
    const raw = sessionStorage.getItem(OCR_STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(OCR_STORAGE_KEY);
    const parsed = JSON.parse(raw) as { drafts?: any[]; savedAt?: number };
    // 10 分钟内的预填数据才生效
    if (parsed.savedAt && Date.now() - parsed.savedAt > 10 * 60_000) return null;
    return Array.isArray(parsed.drafts) && parsed.drafts.length ? parsed.drafts : null;
  } catch {
    return null;
  }
}

const TYPE_LABELS: Record<string, string> = {
  question: '题目',
  calculation_group: '口算题组',
  composite_group: '复合题',
};
const QUESTION_TYPE_LABELS: Record<string, string> = {
  fill_blank: '填空',
  single_choice: '单选',
  multiple_choice: '多选',
  true_false: '判断',
  ordering: '排序',
  matching: '连线',
  sentence_build: '连词成句',
};

function draftBadge(draft: any) {
  if (draft?.type === 'composite_group') return '复合';
  const qt = draft?.question?.question_type;
  return QUESTION_TYPE_LABELS[qt] || TYPE_LABELS[draft?.type] || '未知';
}

function draftTitle(draft: any) {
  return String(draft?.title ?? draft?.question?.stem ?? '').slice(0, 50) || '未命名';
}

/**
 * 拍照识别录入面板
 * 上传/拖拽试卷图片 → 调用百度 OCR → 收集草稿 → 跳转 JSON 导入页继续编辑/保存
 */
export function OcrEntryPanel() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<OcrStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [images, setImages] = useState<ImageResult[]>([]);
  const [recognizing, setRecognizing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getOcrStatus()
      .then((s) => { if (!cancelled) { setStatus(s); setStatusLoading(false); } })
      .catch(() => {
        if (!cancelled) {
          setStatus({ providers: { baidu: { configured: false }, paddle: { configured: false } }, activeProvider: null, configured: false });
          setStatusLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const totalDrafts = images.reduce((sum, img) => sum + (img.drafts?.length ?? 0), 0);
  const allDrafts = images.flatMap((img) => img.drafts ?? []);

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => /^image\//.test(f.type) || /\.(png|jpe?g|webp|bmp|gif)$/i.test(f.name));
    if (!arr.length) {
      toast.warning('请选择图片文件（PNG / JPG / WEBP）');
      return;
    }
    Promise.all(arr.map(async (file) => {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      return { file, dataUrl, status: 'pending' as const };
    })).then((next) => {
      setImages((prev) => [...prev, ...next]);
    });
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  /**
   * 识别单张图片，根据 activeProvider 选择百度（同步）或 PaddleOCR（异步轮询）。
   * 返回草稿数组。
   */
  async function recognizeImage(dataUrl: string, fileName?: string, onProgress?: (msg: string) => void): Promise<any[]> {
    const provider = status?.activeProvider;
    if (provider === 'paddle') {
      // PaddleOCR：提交 → 轮询
      onProgress?.('提交识别任务…');
      const { jobId } = await paddleSubmit({ dataUrl, fileName });
      const deadline = Date.now() + 180_000; // 最多等 3 分钟
      let polled = 0;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 4000));
        polled += 1;
        const job = await paddleStatus(jobId);
        if (job.state === 'done') {
          return job.drafts ?? [];
        }
        if (job.state === 'failed') {
          throw new Error(job.error || 'PaddleOCR 识别失败');
        }
        const progress = job.progress ? `${job.progress.done}/${job.progress.total} 页` : '处理中';
        onProgress?.(`识别中（${progress}）…`);
        if (polled % 5 === 0) onProgress?.(`仍在识别（已等待 ${polled * 4}s）…`);
      }
      throw new Error('PaddleOCR 识别超时（3 分钟），可稍后重试');
    }
    // 百度 paper_cut：同步
    onProgress?.('识别中…');
    const resp = await paperCut({ dataUrl });
    return resp.drafts;
  }

  async function recognizeAll() {
    if (!images.length) return;
    setRecognizing(true);
    let okCount = 0;
    let errCount = 0;
    for (let i = 0; i < images.length; i += 1) {
      if (images[i].status === 'done') continue;
      setImages((prev) => prev.map((img, idx) => idx === i ? { ...img, status: 'loading', error: undefined } : img));
      try {
        const drafts = await recognizeImage(images[i].dataUrl, images[i].file.name);
        setImages((prev) => prev.map((img, idx) => idx === i ? { ...img, status: 'done', drafts, error: undefined } : img));
        okCount += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setImages((prev) => prev.map((img, idx) => idx === i ? { ...img, status: 'error', error: msg } : img));
        errCount += 1;
      }
    }
    setRecognizing(false);
    if (errCount === 0) toast.success(`识别完成，共 ${okCount} 张图片`);
    else if (okCount === 0) toast.danger(`识别失败 ${errCount} 张，请检查密钥配置或网络`);
    else toast.warning(`成功 ${okCount} 张，失败 ${errCount} 张`);
  }

  async function recognizeOne(index: number) {
    setImages((prev) => prev.map((img, idx) => idx === index ? { ...img, status: 'loading', error: undefined } : img));
    try {
      const drafts = await recognizeImage(images[index].dataUrl, images[index].file.name);
      setImages((prev) => prev.map((img, idx) => idx === index ? { ...img, status: 'done', drafts, error: undefined } : img));
      toast.success(`识别完成，得到 ${drafts.length} 道题`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setImages((prev) => prev.map((img, idx) => idx === index ? { ...img, status: 'error', error: msg } : img));
      toast.danger(`识别失败：${msg}`);
    }
  }

  function sendToImport() {
    if (!allDrafts.length) {
      toast.warning('没有可发送的题目，请先识别图片');
      return;
    }
    writeOcrPrefill(allDrafts);
    toast.success(`已发送 ${allDrafts.length} 道题到 JSON 导入页`);
    navigate('/parent/questions/import-json');
  }

  const configured = status?.configured ?? false;
  const activeProvider = status?.activeProvider;
  const paddleReady = status?.providers?.paddle?.configured ?? false;
  const baiduReady = status?.providers?.baidu?.configured ?? false;

  return (
    <div className="ocr-entry-panel">
      <div className="card">
        <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-3)' }}>📷 拍照识别录入</h2>
        <p className="tip" style={{ marginBottom: 'var(--space-4)' }}>
          上传试卷/练习册照片，自动识别题目并转换为可编辑的结构化草稿。识别完成后发送到 JSON 导入页进行校验与批量保存。
        </p>

        {/* 状态提示 */}
        {statusLoading ? (
          <div className="ocr-status ocr-status-loading">正在检查 OCR 服务配置…</div>
        ) : configured ? (
          <div className="ocr-status ocr-status-ok">
            ✓ 已启用 OCR 服务（当前使用 <b>{activeProvider === 'paddle' ? 'PaddleOCR-VL' : '百度试卷切题'}</b>）
            <span className="ocr-provider-chips">
              <span className={`ocr-chip ${paddleReady ? 'on' : 'off'}`}>PaddleOCR {paddleReady ? '✓' : '×'}</span>
              <span className={`ocr-chip ${baiduReady ? 'on' : 'off'}`}>百度切题 {baiduReady ? '✓' : '×'}</span>
            </span>
          </div>
        ) : (
          <div className="ocr-status ocr-status-warn">
            ⚠ 尚未配置任何 OCR 服务。请在根目录 <code>.env</code> 中至少配置一组密钥后重启 API 服务：
            <pre className="ocr-env-hint">{`# 方案一：PaddleOCR-VL（AI Studio，推荐）
PADDLEOCR_TOKEN=你的AIStudioToken

# 方案二：百度智能云试卷切题识别
BAIDU_OCR_API_KEY=你的APIKey
BAIDU_OCR_SECRET_KEY=你的SecretKey`}</pre>
          </div>
        )}

        {/* 拖拽上传区 */}
        <div
          className={`ocr-dropzone ${dragOver ? 'drag-over' : ''} ${!configured ? 'disabled' : ''}`}
          onDragOver={(e) => { e.preventDefault(); if (configured) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => configured && fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <div className="ocr-dropzone-icon">📤</div>
          <div className="ocr-dropzone-text">点击选择图片，或拖拽试卷图片到此处</div>
          <div className="ocr-dropzone-hint">支持 PNG / JPG / WEBP，可多选，每张建议 &lt; 4MB</div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={onInputChange}
            disabled={!configured}
          />
        </div>

        {/* 已选图片列表 */}
        {images.length > 0 && (
          <div className="ocr-image-list">
            <div className="ocr-image-list-header">
              <span>已选 {images.length} 张图片 · 识别出 {totalDrafts} 道题</span>
              <div className="rowActions">
                <button className="btn btn-secondary btn-sm" onClick={() => setImages([])} disabled={recognizing}>清空</button>
                <button className="btn btn-primary btn-sm" onClick={recognizeAll} disabled={!configured || recognizing}>
                  {recognizing ? '识别中…' : `识别全部${images.some((i) => i.status === 'pending' || i.status === 'error') ? '' : '（已完成）'}`}
                </button>
              </div>
            </div>
            {images.map((img, index) => (
              <div key={index} className={`ocr-image-item status-${img.status}`}>
                <div className="ocr-image-thumb">
                  <img src={img.dataUrl} alt={img.file.name} />
                </div>
                <div className="ocr-image-info">
                  <div className="ocr-image-name" title={img.file.name}>{img.file.name}</div>
                  <div className="ocr-image-meta">
                    {img.status === 'pending' && <span className="tag tag-muted">待识别</span>}
                    {img.status === 'loading' && <span className="tag tag-info">识别中…</span>}
                    {img.status === 'done' && <span className="tag tag-success">✓ {(img.drafts ?? []).length} 题</span>}
                    {img.status === 'error' && <span className="tag tag-error">✗ 失败</span>}
                    {(img.drafts?.length ?? 0) > 0 && (
                      <ul className="ocr-draft-preview">
                        {img.drafts!.slice(0, 5).map((d, di) => (
                          <li key={di}>
                            <span className="ocr-draft-badge">{draftBadge(d)}</span>
                            <span className="ocr-draft-title">{draftTitle(d)}</span>
                          </li>
                        ))}
                        {(img.drafts?.length ?? 0) > 5 && <li className="ocr-draft-more">…还有 {(img.drafts!.length) - 5} 道</li>}
                      </ul>
                    )}
                    {img.status === 'error' && <div className="ocr-image-error">{img.error}</div>}
                  </div>
                  <div className="ocr-image-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => removeImage(index)} disabled={recognizing}>移除</button>
                    {img.status !== 'done' && (
                      <button className="btn btn-outline btn-sm" onClick={() => recognizeOne(index)} disabled={!configured || recognizing}>
                        {img.status === 'loading' ? '识别中…' : img.status === 'error' ? '重试' : '识别'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 底部操作 */}
        {allDrafts.length > 0 && (
          <div className="ocr-footer-actions">
            <div className="ocr-footer-summary">
              共识别出 <b>{allDrafts.length}</b> 道题，发送到 JSON 导入页可逐题校验、编辑、批量保存。
            </div>
            <button className="btn btn-primary" onClick={sendToImport} disabled={recognizing}>
              发送到 JSON 导入页 →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
