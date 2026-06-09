const OPENROUTER_KEY = process.env.EXPO_PUBLIC_OPENROUTER_KEY ?? '';

const MODELS = [
  'meta-llama/llama-3-8b-instruct:free',
  'google/gemma-2-9b-it:free',
  'mistralai/mistral-7b-instruct:free',
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
          max_tokens: 1024,
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

export async function generateQuestions(text: string): Promise<string[]> {
  const result = await callAI(
    `اقترح ٥ أسئلة متوقعة في الاختبار بناءً على هذه المحاضرة. اكتب كل سؤال في سطر يبدأ بـ "؟ ":\n\n${text}`,
    SYSTEM
  );
  return result.split('\n').filter(l => l.trim()).map(l => l.replace(/^؟\s*/, '').trim()).filter(Boolean);
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
