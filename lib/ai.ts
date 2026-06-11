import { QuestionAnswer } from './storage';

const getOpenRouterKey = () => (process.env.EXPO_PUBLIC_OPENROUTER_KEY ?? '').trim();

// ── Pollinations.ai — completely free, no API key needed ──────────────
const POLLINATIONS_URL = 'https://text.pollinations.ai/openai';

async function callPollinations(messages: { role: string; content: any }[]): Promise<string> {
  const models = ['openai', 'mistral', 'llama'];
  for (const model of models) {
    try {
      const res = await fetch(POLLINATIONS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          seed: Math.floor(Math.random() * 9999),
          private: true,
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (text?.trim()) return text.trim();
    } catch { continue; }
  }
  throw new Error('pollinations_failed');
}

// ── OpenRouter — used when API key is present ─────────────────────────
const OR_MODELS = [
  'meta-llama/llama-3-8b-instruct:free',
  'google/gemma-2-9b-it:free',
  'mistralai/mistral-7b-instruct:free',
];

const OR_VISION_MODELS = [
  'meta-llama/llama-4-scout:free',
  'meta-llama/llama-4-maverick:free',
  'google/gemma-3-12b-it:free',
];

async function callOpenRouter(messages: { role: string; content: any }[], vision = false): Promise<string> {
  const key = getOpenRouterKey();
  if (!key) throw new Error('no_key');
  const models = vision ? OR_VISION_MODELS : OR_MODELS;
  for (const model of models) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://lecture-notebook.app',
        },
        body: JSON.stringify({ model, messages, max_tokens: 1500, temperature: 0.7 }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (text?.trim()) return text.trim();
    } catch { continue; }
  }
  throw new Error('openrouter_failed');
}

// ── Unified text call: try OpenRouter first, fallback to Pollinations ─
async function callAI(prompt: string, systemPrompt?: string): Promise<string> {
  const messages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    { role: 'user', content: prompt },
  ];
  const key = getOpenRouterKey();
  if (key) {
    try { return await callOpenRouter(messages); } catch { /* fallback */ }
  }
  return callPollinations(messages);
}

// ── Vision call: try OpenRouter first, fallback to Pollinations vision ─
async function callVisionAI(imageBase64: string, prompt: string): Promise<string> {
  const imageContent = [
    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
    { type: 'text', text: prompt },
  ];
  const messages = [{ role: 'user', content: imageContent }];
  const key = getOpenRouterKey();
  if (key) {
    try { return await callOpenRouter(messages, true); } catch { /* fallback */ }
  }
  try { return await callPollinations(messages); } catch { /* fallback */ }
  throw new Error('فشل تحليل الصورة. حاول مرة أخرى.');
}

// ── System prompt ─────────────────────────────────────────────────────
const SYSTEM = `أنت مساعد دراسي ذكي متخصص في تلخيص وتحليل محاضرات الجامعة.
ردودك دائماً باللغة العربية الفصحى الواضحة.
كن مختصراً ومفيداً.`;

export const AI_PROVIDER_INFO = {
  hasKey: () => !!getOpenRouterKey(),
  label: () => getOpenRouterKey() ? 'OpenRouter (مفتاح مخصص)' : 'Pollinations AI (مجاني)',
};

export async function summarizeLecture(text: string): Promise<string> {
  return callAI(`لخّص هذه المحاضرة الجامعية في ٥-٧ جمل مفيدة:\n\n${text}`, SYSTEM);
}

export async function extractKeyPoints(text: string): Promise<string[]> {
  const result = await callAI(
    `استخرج أهم ١٠ نقاط من هذه المحاضرة. اكتب كل نقطة في سطر منفصل تبدأ بـ "- ":\n\n${text}`,
    SYSTEM
  );
  return result.split('\n').filter(l => l.trim().startsWith('-')).map(l => l.replace(/^-\s*/, '').trim());
}

export async function generateQuestions(text: string): Promise<QuestionAnswer[]> {
  const result = await callAI(
    `اقترح ٥ أسئلة متوقعة في الاختبار مع إجاباتها بناءً على هذه المحاضرة.
اكتب كل سؤال على سطر يبدأ بـ "س: " وإجابته على السطر التالي يبدأ بـ "ج: ":\n\n${text}`,
    SYSTEM
  );
  const lines = result.split('\n').map(l => l.trim()).filter(Boolean);
  const questions: QuestionAnswer[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].startsWith('س:') && lines[i + 1]?.startsWith('ج:')) {
      questions.push({
        question: lines[i].replace(/^س:\s*/, '').trim(),
        answer: lines[i + 1].replace(/^ج:\s*/, '').trim(),
      });
      i++;
    }
  }
  return questions.length > 0 ? questions : [];
}

export async function suggestTags(text: string): Promise<string[]> {
  const result = await callAI(
    `اقترح ٥ كلمات مفتاحية قصيرة لهذه المحاضرة (كلمة أو كلمتان لكل منها)، افصلها بفاصلة:\n\n${text.slice(0, 500)}`,
    SYSTEM
  );
  return result.split(/[،,]/).map(t => t.trim()).filter(Boolean).slice(0, 6);
}

export async function aiChat(question: string, context: string): Promise<string> {
  return callAI(
    `سياق المحاضرة:\n${context}\n\nسؤال الطالب: ${question}`,
    SYSTEM + '\nأجب على سؤال الطالب بناءً على سياق المحاضرة المُعطى فقط.'
  );
}

export async function ocrImage(imageBase64: string): Promise<string> {
  return callVisionAI(
    imageBase64,
    `استخرج كل النص المكتوب في هذه الصورة بدقة. اكتب النص كما هو دون تعديل. إذا كان النص بالعربية فاكتبه بالعربية. إذا لم يكن هناك نص، اكتب "لا يوجد نص".`
  );
}

export async function analyzeHandwriting(imageBase64: string): Promise<string> {
  return callVisionAI(
    imageBase64,
    `هذه صورة للوحة كتابة يدوية لمحاضرة جامعية. حوّل الكتابة اليدوية إلى نص مكتوب بشكل واضح. إذا كان هناك رسومات أو مخططات، صفها بإيجاز. رتّب النص بشكل منطقي.`
  );
}

export async function analyzeWhiteboardImage(imageBase64: string): Promise<string> {
  return callVisionAI(
    imageBase64,
    `هذه صورة سبورة من محاضرة جامعية. 1. استخرج كل النص المكتوب 2. صف أي معادلات أو رسومات 3. لخّص المحتوى بإيجاز. الرد باللغة العربية.`
  );
}

export async function analyzeDocument(textContent: string, fileName: string): Promise<{
  summary: string;
  keyPoints: string[];
  questions: QuestionAnswer[];
  tags: string[];
}> {
  const truncated = textContent.slice(0, 5000);
  const raw = await callAI(
    `حلّل محتوى الملف "${fileName}" وأعطني:

1. ملخص: (3-5 جمل)
2. نقاط رئيسية: (اكتب كل نقطة في سطر يبدأ بـ "- ")
3. أسئلة: (كل سؤال يبدأ بـ "س: " وإجابته في السطر التالي تبدأ بـ "ج: ")
4. كلمات مفتاحية: (مفصولة بفاصلة)

محتوى الملف:
${truncated}`,
    SYSTEM
  );

  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  let summary = '';
  const kp: string[] = [];
  const qs: QuestionAnswer[] = [];
  let tags: string[] = [];
  let section = '';

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.includes('ملخص')) { section = 'summary'; continue; }
    if (l.includes('نقاط رئيسية') || l.includes('نقاط')) { section = 'kp'; continue; }
    if (l.includes('أسئلة')) { section = 'q'; continue; }
    if (l.includes('كلمات مفتاحية') || l.includes('مفتاحية')) { section = 'tags'; continue; }

    if (section === 'summary' && !summary) summary = l;
    else if (section === 'summary' && !l.startsWith('-') && !l.match(/^\d/)) summary += ' ' + l;
    else if (section === 'kp' && l.startsWith('-')) kp.push(l.replace(/^-\s*/, ''));
    else if (section === 'q' && l.startsWith('س:') && lines[i+1]?.startsWith('ج:')) {
      qs.push({ question: l.replace(/^س:\s*/, ''), answer: lines[i+1].replace(/^ج:\s*/, '') });
      i++;
    } else if (section === 'tags') {
      tags = l.split(/[،,]/).map(t => t.trim()).filter(Boolean);
    }
  }

  return {
    summary: summary || raw.slice(0, 200),
    keyPoints: kp.slice(0, 8),
    questions: qs.slice(0, 5),
    tags: tags.slice(0, 6),
  };
}

export async function analyzeImageAttachment(imageBase64: string, mimeType: string): Promise<string> {
  return callVisionAI(
    imageBase64,
    `هذه صورة/مستند من محاضرة جامعية. استخرج جميع المعلومات والنصوص الموجودة فيها بالتفصيل. الرد باللغة العربية.`
  );
}
