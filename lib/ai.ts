import { QuestionAnswer } from './storage';

const OPENROUTER_KEY = process.env.EXPO_PUBLIC_OPENROUTER_KEY ?? '';

const MODELS = [
  'meta-llama/llama-3-8b-instruct:free',
  'google/gemma-2-9b-it:free',
  'mistralai/mistral-7b-instruct:free',
];

const VISION_MODELS = [
  'meta-llama/llama-4-scout:free',
  'meta-llama/llama-4-maverick:free',
  'google/gemma-3-12b-it:free',
];

async function callAI(prompt: string, systemPrompt?: string): Promise<string> {
  for (const model of MODELS) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://lecture-notebook.app',
        },
        body: JSON.stringify({
          model,
          messages: [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            { role: 'user', content: prompt },
          ],
          max_tokens: 1500,
          temperature: 0.7,
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (text) return text.trim();
    } catch {
      continue;
    }
  }
  throw new Error('فشل الاتصال بالذكاء الاصطناعي');
}

async function callVisionAI(imageBase64: string, prompt: string): Promise<string> {
  for (const model of VISION_MODELS) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://lecture-notebook.app',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
                },
                { type: 'text', text: prompt },
              ],
            },
          ],
          max_tokens: 2000,
          temperature: 0.3,
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (text) return text.trim();
    } catch {
      continue;
    }
  }
  throw new Error('فشل تحليل الصورة');
}

const SYSTEM = `أنت مساعد دراسي ذكي متخصص في تلخيص وتحليل محاضرات الجامعة. 
ردودك دائماً باللغة العربية الفصحى الواضحة. 
كن مختصراً ومفيداً.`;

export async function summarizeLecture(text: string): Promise<string> {
  return callAI(
    `لخّص هذه المحاضرة الجامعية في ٥-٧ جمل مفيدة:\n\n${text}`,
    SYSTEM
  );
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
    `استخرج كل النص المكتوب في هذه الصورة بدقة. 
اكتب النص كما هو دون تعديل. إذا كان النص بالعربية فاكتبه بالعربية.
إذا لم يكن هناك نص، اكتب "لا يوجد نص".`
  );
}

export async function analyzeHandwriting(imageBase64: string): Promise<string> {
  return callVisionAI(
    imageBase64,
    `هذه صورة للوحة كتابة يدوية لمحاضرة جامعية.
حوّل الكتابة اليدوية إلى نص مكتوب بشكل واضح.
إذا كان هناك رسومات أو مخططات، صفها بإيجاز.
رتّب النص بشكل منطقي.`
  );
}

export async function analyzeWhiteboardImage(imageBase64: string): Promise<string> {
  return callVisionAI(
    imageBase64,
    `هذه صورة سبورة من محاضرة جامعية.
1. استخرج كل النص المكتوب
2. صف أي معادلات أو رسومات
3. لخّص المحتوى بإيجاز
الرد باللغة العربية.`
  );
}
