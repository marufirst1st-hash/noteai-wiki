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

    const prompt = `당신은 지식 관리 전문가입니다. 아래는 ${fileTypeHint}에서 추출한 **실제 텍스트 원문**입니다.
이 원문의 **내용 자체**를 분석하여 지식 베이스에 저장할 수 있는 마크다운 문서로 정리하세요.

━━━ 원문 내용 (${cleanContent.length.toLocaleString()}자) ━━━
${cleanContent.slice(0, 6000)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**작성 규칙:**
- 파일 형식/구조 설명 절대 금지 ("PDF 문서입니다", "Excel 파일로 구성" 등 X)
- 원문에 있는 실제 정보, 수치, 사실만 추출하여 정리
- 원문에 없는 내용 추가 금지
${isExcel || isCsv ? `- 데이터의 각 행/열이 의미하는 실제 수치와 항목을 표 또는 항목으로 정리
- 합계, 평균, 최대/최소값 등 중요 수치 강조` : `- 문서에 언급된 핵심 사실, 주장, 결론을 항목으로 정리
- 날짜, 이름, 수치 등 구체적 정보 그대로 포함`}

**출력 형식:**
## 핵심 내용
(원문에서 추출한 가장 중요한 정보 3~7개를 항목으로)

## 상세 내용
${isExcel || isCsv ? '(데이터 테이블 또는 주요 수치/항목 정리)' : '(원문의 주요 내용을 섹션별로 구조화)'}

## 주요 수치 / 데이터
(원문에 등장하는 숫자, 날짜, 고유명사 등 중요 데이터 목록)`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_KEY}`,
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
