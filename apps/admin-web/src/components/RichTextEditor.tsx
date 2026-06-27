import { useEffect, useRef, useState, type ClipboardEvent } from 'react';
import { useToast } from './ToastProvider';
import { ConfirmDialog } from './Modal';

type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  uploadImage?: (file: File) => Promise<{ url: string }>;
};

const TEXT = {
  placeholder: '请输入解题解析，支持加粗、列表、图片上传/粘贴。',
  imageUrlPrompt: '请输入图片 URL',
  uploadFailed: '图片上传失败',
  bold: '加粗',
  italic: '斜体',
  unorderedList: '项目列表',
  orderedList: '编号列表',
  imageUrl: '图片 URL',
  uploading: '上传中...',
  uploadImage: '上传图片',
  clear: '清空',
  undo: '撤销',
  redo: '重做',
};

function htmlToText(html: string) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent?.trim() ?? '';
}

export function richTextToPlainText(html: string) {
  if (typeof document === 'undefined') return html.replace(/<[^>]+>/g, '').trim();
  return htmlToText(html);
}

export function RichTextEditor({ value, onChange, uploadImage, placeholder = TEXT.placeholder }: RichTextEditorProps) {
  const { toast } = useToast();
  const ref = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [uploading, setUploading] = useState(false);
  const [urlInputOpen, setUrlInputOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [clearOpen, setClearOpen] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== value) el.innerHTML = value || '';
    refreshHistoryState();
  }, [value]);

  const emit = () => {
    onChange(ref.current?.innerHTML ?? '');
    refreshHistoryState();
  };
  const refreshHistoryState = () => {
    try {
      // execCommand 的历史栈是 document 级
      setCanUndo(document.queryCommandEnabled('undo') && document.queryCommandValue('undo') !== 'false');
      setCanRedo(document.queryCommandEnabled('redo') && document.queryCommandValue('redo') !== 'false');
    } catch {
      // 某些浏览器不支持，静默
    }
  };
  const saveSelection = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount) savedRangeRef.current = selection.getRangeAt(0).cloneRange();
  };
  const restoreSelection = () => {
    ref.current?.focus();
    const selection = window.getSelection();
    const range = savedRangeRef.current;
    if (!selection || !range) return;
    selection.removeAllRanges();
    selection.addRange(range);
  };
  const exec = (command: string, argument?: string) => {
    restoreSelection();
    try {
      document.execCommand(command, false, argument);
    } catch {
      /* ignore */
    }
    ref.current?.focus();
    saveSelection();
    emit();
  };
  const insertImageUrl = (url: string) => exec('insertImage', url);

  const submitImageUrl = () => {
    const url = imageUrl.trim();
    if (!url) {
      setUrlInputOpen(false);
      return;
    }
    insertImageUrl(url);
    setImageUrl('');
    setUrlInputOpen(false);
  };

  const insertImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (!uploadImage) {
      const localUrl = URL.createObjectURL(file);
      insertImageUrl(localUrl);
      return;
    }
    try {
      setUploading(true);
      restoreSelection();
      const result = await uploadImage(file);
      insertImageUrl(result.url);
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : TEXT.uploadFailed);
    } finally {
      setUploading(false);
    }
  };
  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    saveSelection();
    const image = Array.from(event.clipboardData.items)
      .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
      ?.getAsFile();
    if (!image) return;
    event.preventDefault();
    void insertImageFile(image);
  };

  return (
    <div className="rich-editor">
      <div className="rich-editor-toolbar">
        <button type="button" className="btn btn-outline btn-sm" onMouseDown={saveSelection} onClick={() => exec('undo')} disabled={!canUndo} title={TEXT.undo} aria-label={TEXT.undo}>↶</button>
        <button type="button" className="btn btn-outline btn-sm" onMouseDown={saveSelection} onClick={() => exec('redo')} disabled={!canRedo} title={TEXT.redo} aria-label={TEXT.redo}>↷</button>
        <span className="rich-editor-divider" aria-hidden="true" />
        <button type="button" className="btn btn-outline btn-sm" onMouseDown={saveSelection} onClick={() => exec('bold')}><b>{TEXT.bold}</b></button>
        <button type="button" className="btn btn-outline btn-sm" onMouseDown={saveSelection} onClick={() => exec('italic')}><i>{TEXT.italic}</i></button>
        <button type="button" className="btn btn-outline btn-sm" onMouseDown={saveSelection} onClick={() => exec('insertUnorderedList')}>{TEXT.unorderedList}</button>
        <button type="button" className="btn btn-outline btn-sm" onMouseDown={saveSelection} onClick={() => exec('insertOrderedList')}>{TEXT.orderedList}</button>
        <span className="rich-editor-divider" aria-hidden="true" />
        <button type="button" className="btn btn-outline btn-sm" onMouseDown={saveSelection} onClick={() => { setImageUrl(''); setUrlInputOpen(true); }}>{TEXT.imageUrl}</button>
        <button type="button" className="btn btn-outline btn-sm" onMouseDown={saveSelection} onClick={() => fileInputRef.current?.click()} disabled={uploading}>{uploading ? TEXT.uploading : TEXT.uploadImage}</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setClearOpen(true)}>{TEXT.clear}</button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void insertImageFile(file);
          }}
        />
      </div>
      {urlInputOpen && (
        <div className="rich-editor-url-row">
          <label htmlFor="rich-image-url">{TEXT.imageUrlPrompt}</label>
          <input
            id="rich-image-url"
            type="url"
            className="input-sm"
            value={imageUrl}
            autoFocus
            placeholder="https://..."
            onChange={(e) => setImageUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); submitImageUrl(); }
              else if (e.key === 'Escape') setUrlInputOpen(false);
            }}
          />
          <button type="button" className="btn btn-primary btn-sm" onClick={submitImageUrl}>插入</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setUrlInputOpen(false)}>取消</button>
        </div>
      )}
      <div
        ref={ref}
        className="rich-editor-content"
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label="解析内容"
        data-placeholder={placeholder}
        onInput={() => { saveSelection(); emit(); }}
        onBlur={emit}
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
        onPaste={onPaste}
        suppressContentEditableWarning
      />

      <ConfirmDialog
        open={clearOpen}
        title="清空解析"
        danger
        confirmText="清空"
        description="确定要清空全部解析内容吗？此操作可通过「撤销」按钮在编辑器内恢复。"
        onConfirm={() => { onChange(''); setClearOpen(false); }}
        onCancel={() => setClearOpen(false)}
      />
    </div>
  );
}
