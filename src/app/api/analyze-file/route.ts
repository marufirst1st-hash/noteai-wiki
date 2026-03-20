import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { content, fileName } = await req.json();
  if (!content) return NextResponse.json({ error: '내용 없음' }, { status: 400 });

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) return NextResponse.json({ error: 'API 키 없음' }, { status: 500 });

  try {
    const prompt = `다음 파일의 내용을 분석하고 마크다운 형식으로 요약해주세요.

파일명: ${fileName}
내용:
${content.slice(0, 3000)}

분석 결과를 다음 형식으로 작성하세요:
1. 파일 개요 (파일 유형, 데이터 구조)
2. 주요 내용 요약
3. 핵심 데이터/정보 추출
4. 인사이트 또는 특이사항
5. 활용 제안

마크다운 형식으로 한국어로 작성하세요.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 2048 },
        }),
      }
    );

    if (!response.ok) throw new Error('Gemini 오류');
    const data = await response.json();
    const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text || '분석 실패';
    return NextResponse.json({ analysis });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '분석 오류';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
