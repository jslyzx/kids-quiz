import React, { useState } from 'react';
import type { AppState, ChildDraftInput, ChildType, MaterialInput } from '../../types/editor';
import { blankKeys } from '../../utils/blanks';
import { RichTextEditor } from '../RichTextEditor';
import { uploadImage } from '../../api/uploads';

function childAnswers(child: ChildDraftInput) {
  const keys = blankKeys(child.stem);
  const base = child.answers ?? { blank_1: child.answer };
  return Object.fromEntries(keys.map((key, index) => [key, base[key] ?? (index === 0 ? child.answer : '')]));
}

function parseBracketBlanks(text: string) {
  const answers: Record<string, string> = {};
  let index = 0;
  const stem = text.replace(/\[([^\]]*)\]/g, (_all, answer: string) => {
    index += 1;
    answers[`blank_${index}`] = String(answer ?? '').trim();
    return `{{blank:${index}}}`;
  });
  return { stem, answers };
}

export function CompositeEditor({ state, setState }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> }) {
  const [batchText, setBatchText] = useState(`根据下面材料回答问题。
材料：苹果12个，梨8个，桃子15个。

1. 苹果有[12]个。
2. 苹果比梨多[4]个。
3. 苹果和桃子一共有[27]个。`);

  const updateMaterial = (index: number, patch: Partial<MaterialInput>) => setState((prev) => ({ ...prev, materials: prev.materials.map((item, i) => i === index ? { ...item, ...patch } : item) }));
  const addMaterial = (type: MaterialInput['type']) => setState((prev) => ({ ...prev, materials: [...prev.materials, { type, title: '', text: type === 'table' ? '名称,数量\n,' : '' }] }));
  const removeMaterial = (index: number) => setState((prev) => ({ ...prev, materials: prev.materials.filter((_, i) => i !== index) }));
  const uploadMaterialImage = async (index: number, file?: File | null) => {
    if (!file) return;
    const result = await uploadImage(file);
    updateMaterial(index, { type: 'image', text: result.url });
  };
  const updateChild = (index: number, patch: Partial<ChildDraftInput>) => setState((prev) => ({ ...prev, children: prev.children.map((child, i) => i === index ? { ...child, ...patch } : child) }));
  const addChild = () => setState((prev) => ({ ...prev, children: [...prev.children, { type: 'fill_blank', stem: `${prev.children.length + 1}. 请填写{{blank:1}}`, answer: '', slotType: 'number', answers: { blank_1: '' }, explanationHtml: '' }] }));
  const removeChild = (index: number) => setState((prev) => ({ ...prev, children: prev.children.filter((_, i) => i !== index) }));
  const insertChildBlank = (index: number) => setState((prev) => ({ ...prev, children: prev.children.map((child, i) => {
    if (i !== index) return child;
    const nextNo = blankKeys(child.stem).length + 1;
    return { ...child, stem: `${child.stem}{{blank:${nextNo}}}`, answers: { ...childAnswers(child), [`blank_${nextNo}`]: '' } };
  }) }));
  const updateChildAnswer = (index: number, key: string, value: string) => setState((prev) => ({ ...prev, children: prev.children.map((child, i) => i === index ? { ...child, answer: key === 'blank_1' ? value : child.answer, answers: { ...childAnswers(child), [key]: value } } : child) }));

  const applyBatch = () => {
    const lines = batchText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const firstQuestionIndex = lines.findIndex((line) => /^\d+[\.\、]\s*/.test(line));
    const materialLines = firstQuestionIndex >= 0 ? lines.slice(0, firstQuestionIndex) : [];
    const questionLines = firstQuestionIndex >= 0 ? lines.slice(firstQuestionIndex) : lines;
    const children = questionLines
      .filter((line) => /\[[^\]]*\]/.test(line))
      .map((line) => {
        const parsed = parseBracketBlanks(line);
        return {
          type: 'fill_blank' as const,
          stem: parsed.stem,
          answer: parsed.answers.blank_1 ?? '',
          slotType: 'number' as const,
          answers: parsed.answers,
          explanationHtml: '',
        };
      });
    if (!children.length) return;
    setState((prev) => ({
      ...prev,
      materials: materialLines.length ? [{ type: 'text', title: '材料', text: materialLines.join('\n') }] : prev.materials,
      children,
    }));
  };

  return <>
    <details className="batch-tool">
      <summary>批量录入复合题</summary>
      <p className="tip" style={{ marginTop: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>格式：先写通用材料，再写多个带编号的小题；把答案写在英文中括号里，例如“苹果有[12]个”。</p>
      <textarea value={batchText} onChange={(e) => setBatchText(e.target.value)} />
      <div className="rowActions" style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={applyBatch}>解析复合题</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setBatchText('')}>清空</button>
      </div>
    </details>

    <div className="sub-head">
      <h3>通用材料</h3>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button className="btn btn-outline btn-sm" onClick={() => addMaterial('text')}>添加文本</button>
        <button className="btn btn-outline btn-sm" onClick={() => addMaterial('table')}>添加表格</button>
        <button className="btn btn-outline btn-sm" onClick={() => addMaterial('image')}>添加图片</button>
      </div>
    </div>
    <p className="tip">复合题可以包含文本、表格或图片 URL。表格用 CSV 录入，第一行是表头。</p>

    {state.materials.map((material, index) => (
      <div className="material-editor" key={index}>
        <div className="child-header">
          <b>材料 {index + 1}</b>
          <button className="btn btn-danger btn-sm" onClick={() => removeMaterial(index)}>删除</button>
        </div>
        <div className="grid-2">
          <div>
            <label>材料类型</label>
            <select value={material.type} onChange={(e) => updateMaterial(index, { type: e.target.value as MaterialInput['type'] })}>
              <option value="text">文本</option>
              <option value="table">表格</option>
              <option value="image">图片 URL</option>
            </select>
          </div>
          <div>
            <label>材料标题</label>
            <input value={material.title ?? ''} onChange={(e) => updateMaterial(index, { title: e.target.value })} placeholder="例如：背景材料" />
          </div>
        </div>
        <label style={{ marginTop: 'var(--space-2)' }}>{material.type === 'table' ? '表格 CSV（逗号分隔）' : material.type === 'image' ? '图片 URL' : '材料正文'}</label>
        {material.type === 'image' && (
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-2)', flexWrap: 'wrap' }}>
            <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer', marginBottom: 0 }}>
              上传图片
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => void uploadMaterialImage(index, e.target.files?.[0])} />
            </label>
            {material.text && <span className="tip">已设置图片，可在右侧预览。</span>}
          </div>
        )}
        <textarea value={material.text} onChange={(e) => updateMaterial(index, { text: e.target.value })} />
      </div>
    ))}

    <div className="sub-head" style={{ marginTop: 'var(--space-4)' }}>
      <h3>小题列表</h3>
      <button className="btn btn-outline btn-sm" onClick={addChild}>添加小题</button>
    </div>

    {state.children.map((child, index) => {
      const keys = blankKeys(child.stem);
      const answers = childAnswers(child);
      return <div className="child-editor" key={index}>
        <div className="child-header">
          <b>小题 {index + 1}</b>
          <button className="btn btn-danger btn-sm" onClick={() => removeChild(index)}>删除</button>
        </div>
        <div className="grid-2">
          <div>
            <label>小题类型</label>
            <select value={child.type} onChange={(e) => { const type = e.target.value as ChildType; updateChild(index, { type, slotType: type === 'compare' ? 'compare_symbol' : 'number' }); }}>
              <option value="fill_blank">填空</option>
              <option value="compare">比较符号</option>
            </select>
          </div>
          <div>
            <label>答案类型</label>
            <select value={child.slotType} onChange={(e) => updateChild(index, { slotType: e.target.value as ChildDraftInput['slotType'] })}>
              <option value="number">数字</option>
              <option value="text">文本</option>
              <option value="compare_symbol">比较符号</option>
            </select>
          </div>
        </div>
        <label style={{ marginTop: 'var(--space-2)' }}>小题题干</label>
        <textarea value={child.stem} onChange={(e) => updateChild(index, { stem: e.target.value })} />
        <button className="btn btn-outline btn-sm" style={{ alignSelf: 'flex-start', marginTop: 'var(--space-2)' }} onClick={() => insertChildBlank(index)}>插入空位</button>
        <div style={{ marginTop: 'var(--space-3)' }}>
          <label>小题解析（可选）</label>
          <RichTextEditor value={child.explanationHtml ?? ''} onChange={(value) => updateChild(index, { explanationHtml: value })} uploadImage={uploadImage} />
        </div>
        <div className="slot-list">
          <b>小题答案配置</b>
          {keys.map((key) => <div className="slot-row" key={key}>
            <span>{key}</span>
            <span>{child.slotType}</span>
            {child.slotType === 'compare_symbol' ? (
              <select value={answers[key] || '='} onChange={(e) => updateChildAnswer(index, key, e.target.value)}>
                <option>&gt;</option>
                <option>&lt;</option>
                <option>=</option>
              </select>
            ) : (
              <input value={answers[key] ?? ''} onChange={(e) => updateChildAnswer(index, key, e.target.value)} placeholder="标准答案" />
            )}
          </div>)}
        </div>
      </div>;
    })}
  </>;
}
