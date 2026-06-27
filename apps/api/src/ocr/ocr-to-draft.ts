import { BAIDU_QUS_TYPE, BaiduQusItem } from './ocr.types';
import { cleanText, extractChoiceKeys, injectBlankPlaceholders, makeTitle, parseJudgeAnswer, parseOptions } from './ocr-helpers';

/**
 * 把百度 paper_cut_edu 的 qus_result[] 转换为前端可识别的「OCR 友好草稿」格式。
 *
 * 百度 qus_type：
 *   0 选择 → single_choice（多选时降级为 multiple_choice，但单题无法判断，统一 single_choice 由用户改）
 *   1 判断 → true_false
 *   2 填空 → fill_blank（题干无 {{blank}} 占位时按答案数自动补）
 *   3 问答 → fill_blank（当作主观填空，待人工调整）
 */

/** 把单道百度题转换为 question 草稿（不含 title/meta） */
function convertQuestion(item: BaiduQusItem, index: number): any | null {
  const elem = item.elem_text ?? {};
  const stem = cleanText(elem.stem_text);
  if (!stem && !Array.isArray(elem.option_text)) return null;

  const qusType = Number(item.qus_type);
  const options = parseOptions(elem.option_text);
  const answerText = cleanText(elem.answer_text);

  const question: any = {
    stem: stem || `（第 ${index + 1} 题）`,
  };
  if (answerText) question.explanation = `参考答案：${answerText}`;

  if (qusType === BAIDU_QUS_TYPE.CHOICE) {
    question.question_type = 'single_choice';
    if (options.length) question.options = options;
    const keys = extractChoiceKeys(answerText);
    question.answer = keys.length ? keys : options[0]?.key ?? 'A';
    return question;
  }

  if (qusType === BAIDU_QUS_TYPE.JUDGE) {
    question.question_type = 'true_false';
    question.answer = parseJudgeAnswer(answerText) ?? 'T';
    return question;
  }

  if (qusType === BAIDU_QUS_TYPE.FILL) {
    const answers = answerText
      .split(/[；;\n]/)
      .map((part) => cleanText(part).replace(/^(答案[:：]?|空\s*\d+[:：])\s*/i, ''))
      .filter(Boolean);
    const blankCount = Math.max(1, answers.length);
    question.question_type = 'fill_blank';
    question.stem = injectBlankPlaceholders(stem, blankCount);
    question.answer = answers.length ? answers : [answerText || ''];
    return question;
  }

  // qus_type === 3 (问答) 或未知：当作填空/主观题，待人工调整
  question.question_type = 'fill_blank';
  question.stem = injectBlankPlaceholders(stem, 1);
  question.answer = [answerText || '（请填写参考答案）'];
  return question;
}

/** 把一道百度题（含可能的子题）转换为一项草稿 */
function convertItem(item: BaiduQusItem, index: number): any | null {
  // 有子题 → 复合题
  const subItems = Array.isArray(item.sub_qus_result) ? item.sub_qus_result : [];
  if (subItems.length) {
    const children = subItems.map((sub, i) => convertQuestion(sub, i)).filter(Boolean);
    if (!children.length) return null;
    const commonStem = cleanText(item.elem_text?.stem_text) || '';
    return {
      type: 'composite_group',
      title: makeTitle(commonStem) || `复合题 ${index + 1}`,
      commonStem,
      children,
    };
  }
  // elem_result 分元素返回（部分 API 版本）
  if (Array.isArray(item.elem_result) && item.elem_result.length && !item.elem_text) {
    const stemParts: string[] = [];
    const optionParts: string[] = [];
    let answerPart = '';
    for (const elem of item.elem_result) {
      const et = elem.elem_text ?? {};
      if (et.stem_text) stemParts.push(cleanText(et.stem_text));
      if (Array.isArray(et.option_text)) optionParts.push(...et.option_text);
      if (et.answer_text) answerPart = cleanText(et.answer_text);
    }
    return convertQuestion(
      { qus_type: item.qus_type, elem_text: { stem_text: stemParts.join('\n'), option_text: optionParts, answer_text: answerPart } },
      index,
    );
  }

  const q = convertQuestion(item, index);
  if (!q) return null;
  return {
    type: 'question',
    title: makeTitle(q.stem) || `题目 ${index + 1}`,
    question: q,
  };
}

/**
 * 把百度 words_result[] 扁平化为草稿列表。
 * 每页可能含多道题，全部拍平后返回。
 */
export function ocrWordsResultToDrafts(
  wordsResult: Array<{ qus_result?: BaiduQusItem[] }>,
): any[] {
  const drafts: any[] = [];
  let counter = 0;
  for (const page of wordsResult) {
    const items = Array.isArray(page?.qus_result) ? page.qus_result! : [];
    for (const item of items) {
      const draft = convertItem(item, counter);
      if (draft) {
        drafts.push(draft);
        counter += 1;
      }
    }
  }
  return drafts;
}
