import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { content, fileName } = await req.json();

    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: '내용 없음' }, { status: 400 });
    }

    // 제어 문자 제거
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

    // 파일 유형 판단
    const ext = fileName?.split('.').pop()?.toLowerCase() ?? '';
    const isPdf = ext === 'pdf';
    const isExcel = ext === 'xlsx' || ext === 'xls';
    const isCsv = ext === 'csv';

    const fileTypeHint = isPdf ? 'PDF 문서'
      : isExcel ? 'Excel 스프레드시트'
      : isCsv ? 'CSV 데이터 파일'
      : '텍스트 파일';

    const prompt = `당신은 문서 분석 전문가입니다. 다음 ${fileTypeHint}의 **실제 내용**을 분석하고 마크다운 형식으로 정리해주세요.

파일명: ${fileName || '알 수 없음'}
파일 유형: ${fileTypeHint}
내용 (${cleanContent.length.toLocaleString()}자 중 앞부분):
\`\`\`
${cleanContent.slice(0, 5000)}
\`\`\`

다음 형식으로 분석 결과를 한국어로 작성하세요:

## 파일 개요
- 파일 유형 및 구조 설명
- 전체 데이터 규모 (행/열 수, 페이지 수 등)

## 주요 내용 요약
- 핵심 내용을 3~5개 항목으로 정리

## 핵심 데이터 / 정보
${isExcel || isCsv ? '- 중요한 수치, 항목명, 데이터 패턴 추출\n- 주요 컬럼/필드 설명' : '- 중요한 사실, 수치, 개념 추출'}

## 인사이트
- 데이터에서 발견한 패턴이나 특이사항

## 활용 제안
- 이 파일을 어떻게 활용할 수 있는지 제안

**중요**: 파일명을 분석하는 것이 아니라 파일의 실제 내용을 분석하세요.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 3000 },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API 오류:', response.status, errText);
      return NextResponse.json({
        analysis: buildFallback(fileName, cleanContent),
      });
    }

    const data = await response.json();
    const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!analysis) {
      return NextResponse.json({ analysis: buildFallback(fileName, cleanContent) });
    }

    return NextResponse.json({ analysis });
  } catch (err: unknown) {
    console.error('analyze-file 오류:', err);
    const msg = err instanceof Error ? err.message : '분석 오류';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function buildFallback(fileName: string | undefined, content: string): string {
  const lines = content.split('\n').filter((l) => l.trim());
  return `## 파일 분석 결과\n\n**파일명**: ${fileName || '알 수 없음'}\n**라인 수**: ${lines.length}\n**문자 수**: ${content.length.toLocaleString()}\n\n### 내용 미리보기\n\`\`\`\n${content.slice(0, 500)}\n\`\`\``;
}
