import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * DOMMatrix polyfill – Node.js에는 없지만 pdfjs-dist/legacy가 참조함
 */
function installDOMMatrixPolyfill() {
  if (typeof globalThis.DOMMatrix === 'undefined') {
    // @ts-expect-error – polyfill
    globalThis.DOMMatrix = class DOMMatrix {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
      m11 = 1; m12 = 0; m13 = 0; m14 = 0;
      m21 = 0; m22 = 1; m23 = 0; m24 = 0;
      m31 = 0; m32 = 0; m33 = 1; m34 = 0;
      m41 = 0; m42 = 0; m43 = 0; m44 = 1;
      is2D = true; isIdentity = true;
      constructor(_init?: string | number[]) {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      multiply(_other?: any) { return new (globalThis as any).DOMMatrix(); }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      translate(_tx?: number, _ty?: number, _tz?: number) { return new (globalThis as any).DOMMatrix(); }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scale(_sx?: number, _sy?: number, _sz?: number) { return new (globalThis as any).DOMMatrix(); }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rotate(_angle?: number) { return new (globalThis as any).DOMMatrix(); }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inverse() { return new (globalThis as any).DOMMatrix(); }
      toString() { return 'matrix(1,0,0,1,0,0)'; }
    };
  }
}

/**
 * pdfjs-dist legacy 빌드로 PDF 텍스트 추출
 */
async function extractPdfText(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  installDOMMatrixPolyfill();

  // dynamic import – legacy 빌드 사용 (Node.js 호환)
  const pdfjsLib = await import(
    /* webpackIgnore: true */ 'pdfjs-dist/legacy/build/pdf.mjs'
  ) as typeof import('pdfjs-dist');

  // Worker 없이 메인 스레드에서 파싱
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';

  const uint8Array = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({
    data: uint8Array,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true,
  });

  const pdfDocument = await loadingTask.promise;
  const pageCount = pdfDocument.numPages;
  const textParts: string[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdfDocument.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(' ');
    if (pageText.trim()) {
      textParts.push(`[페이지 ${i}]\n${pageText.trim()}`);
    }
  }

  return {
    text: textParts.join('\n\n'),
    pageCount,
  };
}

/**
 * POST /api/parse-file
 * 파일을 multipart/form-data로 받아서 실제 텍스트를 추출해 반환
 *
 * 지원 형식:
 * - PDF  → pdfjs-dist/legacy (Node.js 호환, DOMMatrix polyfill 포함)
 * - Excel (.xlsx/.xls) → xlsx 라이브러리로 모든 시트 CSV 변환
 * - CSV / TXT / MD → 텍스트 그대로 반환
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // ── PDF 파싱 ──────────────────────────────────────────
    if (ext === 'pdf') {
      try {
        const { text, pageCount } = await extractPdfText(buffer);

        if (!text.trim()) {
          return NextResponse.json(
            {
              error:
                'PDF에서 텍스트를 추출할 수 없습니다. (스캔된 이미지 PDF이거나 보호된 파일일 수 있습니다.)',
            },
            { status: 422 }
          );
        }

        return NextResponse.json({
          type: 'pdf',
          text: text.trim(),
          pageCount,
          charCount: text.length,
          preview: text.trim().slice(0, 500),
        });
      } catch (err) {
        console.error('PDF 파싱 실패:', err);
        return NextResponse.json(
          {
            error: `PDF 파싱 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
          },
          { status: 500 }
        );
      }
    }

    // ── Excel 파싱 ────────────────────────────────────────
    if (ext === 'xlsx' || ext === 'xls') {
      try {
        const xlsxModule = await import('xlsx');
        const { read, utils } = xlsxModule.default ?? xlsxModule;
        const workbook = read(buffer, { type: 'buffer' });

        const sheetsData: {
          name: string;
          csv: string;
          rowCount: number;
          colCount: number;
        }[] = [];

        workbook.SheetNames.forEach((sheetName) => {
          const worksheet = workbook.Sheets[sheetName];
          const csv = utils.sheet_to_csv(worksheet);
          const nonEmptyLines = csv
            .split('\n')
            .filter((l) => l.replace(/,/g, '').trim());
          if (nonEmptyLines.length > 0) {
            const range = utils.decode_range(worksheet['!ref'] || 'A1');
            sheetsData.push({
              name: sheetName,
              csv: csv.trim(),
              rowCount: range.e.r - range.s.r + 1,
              colCount: range.e.c - range.s.c + 1,
            });
          }
        });

        if (sheetsData.length === 0) {
          return NextResponse.json(
            { error: 'Excel 파일에 데이터가 없습니다.' },
            { status: 422 }
          );
        }

        const combined = sheetsData
          .map(
            (s) =>
              `[시트: ${s.name}] (${s.rowCount}행 × ${s.colCount}열)\n${s.csv}`
          )
          .join('\n\n---\n\n');

        return NextResponse.json({
          type: 'excel',
          text: combined,
          sheetCount: sheetsData.length,
          sheets: sheetsData.map((s) => ({
            name: s.name,
            rowCount: s.rowCount,
            colCount: s.colCount,
          })),
          charCount: combined.length,
          preview: sheetsData[0].csv.slice(0, 500),
        });
      } catch (err) {
        console.error('Excel 파싱 실패:', err);
        return NextResponse.json(
          {
            error: `Excel 파싱 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
          },
          { status: 500 }
        );
      }
    }

    // ── CSV / TXT / MD ────────────────────────────────────
    if (ext === 'csv' || ext === 'txt' || ext === 'md') {
      const text = buffer.toString('utf-8');
      return NextResponse.json({
        type: ext,
        text: text.trim(),
        charCount: text.length,
        lineCount: text.split('\n').length,
        preview: text.trim().slice(0, 500),
      });
    }

    return NextResponse.json(
      { error: `지원하지 않는 파일 형식입니다: .${ext}` },
      { status: 400 }
    );
  } catch (err) {
    console.error('parse-file 오류:', err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : '파일 파싱 오류',
      },
      { status: 500 }
    );
  }
}
