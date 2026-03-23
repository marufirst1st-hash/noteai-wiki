import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { content, fileName } = await req.json();

    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: '내용 없음' }, { status: 400 });
    }

    // 제어 문자 제거 (바이너리 잔재 방지)
    const cleanContent = content
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .trim();

    if (cleanContent.length < 10) {
      return NextResponse.json({
        analysis: `## 파일 분석 결과\n\n**파일명**: ${fileName || '알 수 없음'}\n\n분석할 텍스트 내용이 충분하지 않습니다.`,
      });
    }

    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_KEY) {
      return NextResponse.json({ error: 'API 키 없음' }, { status: 500 });
    }

    const prompt = `다음 파일의 내용을 분석하고 마크다운 형식으로 요약해주세요.

파일명: ${fileName || '알 수 없음'}
내용:
${cleanContent.slice(0, 3000)}

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

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API 오류:', response.status, errText);
      // Gemini 실패 시 로컬 폴백 분석 반환
      const lines = cleanContent.split('\n').filter((l) => l.trim());
      return NextResponse.json({
        analysis: `## 파일 분석 결과\n\n**파일명**: ${fileName || '알 수 없음'}\n**라인 수**: ${lines.length}\n**문자 수**: ${cleanContent.length}\n\n### 내용 미리보기\n\`\`\`\n${cleanContent.slice(0, 500)}\n\`\`\``,
      });
    }

    const data = await response.json();
    const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!analysis) {
      const lines = cleanContent.split('\n').filter((l) => l.trim());
      return NextResponse.json({
        analysis: `## 파일 분석 결과\n\n**파일명**: ${fileName || '알 수 없음'}\n**라인 수**: ${lines.length}\n**문자 수**: ${cleanContent.length}\n\n### 내용 미리보기\n\`\`\`\n${cleanContent.slice(0, 500)}\n\`\`\``,
      });
    }

    return NextResponse.json({ analysis });
  } catch (err: unknown) {
    console.error('analyze-file 오류:', err);
    const msg = err instanceof Error ? err.message : '분석 오류';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
