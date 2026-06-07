import { useEffect, useRef, useState, type ClipboardEvent } from 'react';

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
  const ref = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== value) el.innerHTML = value || '';
  }, [value]);

  const emit = () => onChange(ref.current?.innerHTML ?? '');
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
    document.execCommand(command, false, argument);
    ref.current?.focus();
    saveSelection();
    emit();
  };
  const insertImageUrl = (url: string) => exec('insertImage', url);
  const insertImageByUrl = () => {
    const url = window.prompt(TEXT.imageUrlPrompt);
    if (!url?.trim()) return;
    insertImageUrl(url.trim());
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
      window.alert(error instanceof Error ? error.message : TEXT.uploadFailed);
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

  return <div className="rich-editor">
    <div className="rich-editor-toolbar">
      <button type="button" className="btn btn-outline btn-sm" onMouseDown={saveSelection} onClick={() => exec('bold')}>{TEXT.bold}</button>
      <button type="button" className="btn btn-outline btn-sm" onMouseDown={saveSelection} onClick={() => exec('italic')}>{TEXT.italic}</button>
      <button type="button" className="btn btn-outline btn-sm" onMouseDown={saveSelection} onClick={() => exec('insertUnorderedList')}>{TEXT.unorderedList}</button>
      <button type="button" className="btn btn-outline btn-sm" onMouseDown={saveSelection} onClick={() => exec('insertOrderedList')}>{TEXT.orderedList}</button>
      <button type="button" className="btn btn-outline btn-sm" onMouseDown={saveSelection} onClick={insertImageByUrl}>{TEXT.imageUrl}</button>
      <button type="button" className="btn btn-outline btn-sm" onMouseDown={saveSelection} onClick={() => fileInputRef.current?.click()} disabled={uploading}>{uploading ? TEXT.uploading : TEXT.uploadImage}</button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange('')}>{TEXT.clear}</button>
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
    <div
      ref={ref}
      className="rich-editor-content"
      contentEditable
      data-placeholder={placeholder}
      onInput={() => { saveSelection(); emit(); }}
      onBlur={emit}
      onMouseUp={saveSelection}
      onKeyUp={saveSelection}
      onPaste={onPaste}
      suppressContentEditableWarning
    />
  </div>;
}
