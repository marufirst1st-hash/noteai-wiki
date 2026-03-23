# 오류 기록부 (ERRORS.md)

발생했던 오류와 원인, 해결책을 기록합니다.  
**목적**: 같은 실수 반복 방지, 빠른 디버깅 참조용

---

## 오류 목록

### [ERR-001] Supabase DB 스키마 ↔ 코드 불일치
- **발생일**: 2026-03-23
- **심각도**: 🔴 Critical (저장 기능 전체 중단)
- **증상**: `/api/notes` POST → `500 Internal Server Error`
- **원인**:
  - DB 실제 컬럼: `content_json`, `raw_text`, `original_url`, `fabric_json`
  - 코드가 기대한 컬럼: `content`, `tags`, `public_url`, `annotation_data`
  - 초기 DB 스키마 설계와 코드 타입 정의가 별도로 작성되어 동기화되지 않음
- **해결**:
  - `notes` API에 `normalizeNote()` / `denormalizeNote()` 변환 함수 추가
  - `note_images` 저장 시 `original_url`, `fabric_json` 컬럼 사용
  - `dashboard/page.tsx`, `note/[id]/page.tsx` 서버사이드 데이터 변환 추가
- **예방책**:
  - ✅ 코드 작성 전 반드시 DB 테이블 실제 컬럼 목록 확인
  - ✅ `src/types/index.ts` 인터페이스를 DB 컬럼과 항상 동기화
  - ✅ 신규 테이블/컬럼 추가 시 이 문서에 스키마 변경 기록

---

### [ERR-002] GitHub 파일 크기 초과 (core dump 파일 커밋)
- **발생일**: 2026-03-23
- **심각도**: 🟠 Major (GitHub 푸시 차단)
- **증상**: `git push` 실패 — `File core is 619.73 MB; exceeds GitHub's file size limit of 100.00 MB`
- **원인**:
  - 샌드박스에서 프로세스 크래시로 생성된 Linux core dump 파일(`core`, 620MB)이 `git add -A`에 포함됨
  - `.gitignore`에 `core` 파일 패턴이 없었음
- **해결**:
  - `rm -f core` 후 `git commit --amend --no-edit`
  - `.gitignore`에 `core`, `core.*` 추가
- **예방책**:
  - ✅ `.gitignore`에 항상 `core`, `core.*`, `*.dump` 포함
  - ✅ `git add -A` 전 `git status`로 대용량 파일 확인
  - ✅ 100MB 초과 파일은 Git LFS 또는 제외 처리

---

### [ERR-003] Vercel 배포 시 GitHub 연동 미설정
- **발생일**: 2026-03-23
- **심각도**: 🟠 Major (배포 실패)
- **증상**: Vercel 배포 API → `400 Bad Request` — "login connection to the GitHub account must be added"
- **원인**:
  - Vercel 계정(maru1st-9448)에 GitHub 계정(marufirst1st-hash) OAuth 연결이 없었음
  - Vercel CLI로 직접 배포 시도 시 GitHub 앱 설치도 안 되어 있었음
- **해결**:
  - https://github.com/apps/vercel/installations/new 에서 GitHub 앱 설치
  - Vercel 대시보드 설정에서 GitHub 저장소 연결
- **예방책**:
  - ✅ 첫 배포 전 Vercel ↔ GitHub 연동 상태 확인
  - ✅ 신규 프로젝트는 Vercel 대시보드에서 Import → GitHub 흐름 사용

---

### [ERR-004] Supabase `exec_sql` RPC 없음
- **발생일**: 2026-03-23
- **심각도**: 🟡 Minor (마이그레이션 방법 제한)
- **증상**: `supabase.rpc('exec_sql', {...})` → `PGRST202: function not found`
- **원인**:
  - Supabase 기본 프로젝트에는 `exec_sql` 함수가 없음
  - Management API(`api.supabase.com`)는 `service_role` 키가 아닌 Personal Access Token(`sbp_...`) 필요
- **해결**:
  - Supabase 대시보드 SQL Editor에서 직접 실행
  - 또는 Supabase CLI `npx supabase db query --linked` 사용 (Personal Access Token 필요)
- **예방책**:
  - ✅ DB 스키마 변경은 반드시 `supabase/migrations/` 폴더에 SQL 파일로 관리
  - ✅ Supabase Personal Access Token을 별도로 보관
  - ✅ 코드 배포 전 로컬에서 스키마 검증

---

### [ERR-005] Next.js CVE-2025-66478 취약점
- **발생일**: 2026-03-23
- **심각도**: 🔴 Critical (보안 취약점)
- **증상**: Vercel 배포 시 경고 — "vulnerable version of Next.js detected (CVE-2025-66478)"
- **원인**: `next@15.1.0` 사용, 취약점이 패치된 버전 미사용
- **해결**: `next@15.3.9`으로 업그레이드 (`package.json` 수정 후 재배포)
- **예방책**:
  - ✅ 배포 전 `npm audit` 실행
  - ✅ Next.js 보안 공지 주기적 확인
  - ✅ 의존성 버전을 최신 stable로 유지

---

## DB 스키마 현황 (2026-03-23 기준)

코드 작성 시 반드시 아래 실제 컬럼명을 사용할 것.

### `notes` 테이블
| 코드 필드명 | DB 실제 컬럼 | 비고 |
|---|---|---|
| `content` | `content_json` | HTML/JSON 본문 |
| `content` (텍스트) | `raw_text` | 플레인 텍스트 |
| `tags` | `extracted_entities.tags` | JSONB 내 중첩 |
| `metadata` | ❌ 없음 | API에서 무시 |
| `id`, `user_id`, `title`, `note_type`, `status`, `created_at`, `updated_at` | 동일 | — |

### `note_images` 테이블
| 코드 필드명 | DB 실제 컬럼 | 비고 |
|---|---|---|
| `public_url` | `original_url` | 원본 이미지 URL |
| `annotation_data` | `fabric_json` | Fabric.js JSON |
| `file_name` | `ai_description` | 대체 사용 |
| `annotated_url`, `thumbnail_url`, `tags`, `file_size` | 동일 | — |

### `wiki_pages` 테이블
| 코드 필드명 | DB 실제 컬럼 | 비고 |
|---|---|---|
| `created_by` | `user_id` | 작성자 ID |
| `summary` | ❌ 없음 | API에서 무시 |
| `id`, `slug`, `title`, `content`, `tags`, `version`, `is_published`, `created_at`, `updated_at` | 동일 | — |

### `note_embeddings` 테이블
| 코드 필드명 | DB 실제 컬럼 | 비고 |
|---|---|---|
| `chunk_text` | `chunk_text` | NOT NULL 필수 |
| `embedding` | `embedding` | vector 타입 |

---

### [ERR-006] Excel(.xlsx) 파일 업로드 시 /api/analyze-file 500 오류
- **발생일**: 2026-03-23
- **심각도**: 🟠 Major (Excel 파일 분석 기능 전체 중단)
- **증상**: FileEditor에서 .xlsx 업로드 시 `POST /api/analyze-file 500 Internal Server Error`
- **원인**:
  - `.xlsx`는 ZIP 기반 바이너리 파일인데 `file.text()`로 읽으면 깨진 바이너리 문자열 반환
  - 깨진 문자열(`PK\u0003\u0004...`)이 그대로 Gemini API로 전송 → Gemini가 처리 불가
  - 기존 코드가 `papaparse`를 사용했으나 papaparse는 CSV 전용 (xlsx 미지원)
- **해결**:
  - `xlsx` npm 패키지 설치 (`npm install xlsx`)
  - `file.arrayBuffer()` → `XLSX.read(buffer, { type: 'array' })` → `sheet_to_csv()` 방식으로 변경
  - `analyze-file` API에 제어 문자 제거 로직 추가 (`replace(/[\x00-\x08...]/g, '')`)
  - API 실패 시 로컬 폴백 분석 결과 반환하도록 개선
- **예방책**:
  - ✅ 바이너리 파일(.xlsx, .xls, .docx 등)은 반드시 `ArrayBuffer`로 읽기
  - ✅ `file.text()`는 텍스트 파일(csv, txt, md)에만 사용
  - ✅ API에 보내기 전 제어 문자 정리 필수

---

### [ERR-007] xlsx dynamic import에서 `.default` undefined 오류
- **발생일**: 2026-03-23
- **심각도**: 🟠 Major (ERR-006 수정 후에도 Excel 파싱 재실패)
- **증상**: `xlsx 파싱 오류: TypeError: Cannot read properties of undefined (reading 'read')`
- **원인**:
  - `xlsx` 패키지는 CommonJS 모듈 → `import('xlsx').default`가 `undefined`
  - 수정 코드에서 `(await import('xlsx')).default.read(...)` 호출 → `undefined.read()` → TypeError
  - ERR-006 수정 시 `.default` 접근 방식을 잘못 적용
- **해결**:
  ```ts
  // ❌ 잘못된 방식
  const XLSX = (await import('xlsx')).default;  // undefined!
  
  // ✅ 올바른 방식 (CJS 패키지는 .default 없이 직접 구조분해)
  const xlsxModule = await import('xlsx');
  const { read, utils } = xlsxModule.default ?? xlsxModule;
  ```
- **예방책**:
  - ✅ npm 패키지 import 전 `node -e "const m=require('pkg'); console.log(typeof m.default)"` 로 구조 확인
  - ✅ CJS 패키지: `import('pkg')` 후 `.default` 없이 바로 구조분해
  - ✅ ESM 패키지: `import('pkg').default` 사용
  - ✅ 안전한 패턴: `const { fn } = module.default ?? module`

---

### [ERR-008] 위키 합치기 1~4단계가 가짜 딜레이였음 (설계 결함)
- **발생일**: 2026-03-23
- **심각도**: 🔴 Critical (핵심 기능이 명세와 달리 동작)
- **증상**:
  - 위키 합치기 UI에서 5단계 진행 표시는 되지만 실제로는 마지막 단계에서 모든 작업 수행
  - 1~4단계는 `setTimeout(딜레이)`만 실행, AI 처리 없음
  - 이미지가 있는 메모를 합쳐도 이미지 내용이 위키에 반영 안됨
  - 모든 메모를 하나의 거대한 프롬프트에 몰아서 처리 → 토큰 낭비, 품질 저하
- **원인**:
  - 초기 구현 시 5단계 파이프라인 설계만 되고 각 단계 구현이 생략됨
  - `gemini-2.0-flash` 구버전 모델 사용
- **해결** (`src/app/api/merge/route.ts` 전체 재작성):
  - **1단계**: `geminiMultimodal()` - 이미지 URL → base64 변환 후 Gemini Vision으로 실제 이미지 분석, 마인드맵 JSON 구조 파싱
  - **2단계**: `geminiGenerate()` - 인물/장소/개념/날짜/키워드/태그 JSON 추출 (temperature 0.2)
  - **3단계**: `geminiGenerate()` - 중복 탐지 및 모순 해결 결정 JSON 생성 (temperature 0.2)
  - **4단계**: `geminiGenerate()` - TOC + 섹션 아웃라인 JSON 생성 (temperature 0.3)
  - **5단계**: `geminiGenerate()` - 앞 4단계 결과물을 컨텍스트로 전달해 최종 위키 마크다운 작성 (temperature 0.6, `gemini-2.5-flash`)
  - 위키 저장 후 자동 임베딩 생성 추가
  - MergeModal: 단계별 실시간 메시지 + 추출된 키워드/섹션 미리보기 표시
- **예방책**:
  - ✅ 각 단계 구현 후 `console.log`로 실제 AI 응답 확인
  - ✅ UI 진행 단계와 실제 백엔드 처리가 1:1 대응하는지 코드 리뷰
  - ✅ 멀티모달 기능은 이미지 base64 변환 → Gemini `inline_data` 방식 사용

---

## 체크리스트 — 배포 전 확인사항

```
□ git status 확인 (불필요한 대용량 파일 없는지)
□ npm run build 로컬 성공 확인
□ DB 컬럼명과 코드 필드명 일치 확인 (ERRORS.md 스키마 현황 참조)
□ 환경변수 5개 Vercel에 설정되어 있는지 확인
□ npm audit 보안 취약점 없는지 확인
□ 이 문서에 새 오류/변경 사항 추가
```

### [ERR-009] PDF/Excel 파일 내용 미추출 - 파일명만 분석
- **발생일**: 2026-03-23
- **심각도**: 🔴 Critical (파일 메모 핵심 기능 불동작)
- **증상**:
  - PDF 업로드 후 AI가 파일명만 분석 (실제 내용 0%)
  - Excel 저장 후 위키화 시 데이터 없음
- **원인**:
  - PDF: `file.text()`로 읽으면 바이너리 → 깨진 문자열. 실제 텍스트 추출 불가
  - Excel: `handleSave`에서 `rawContent: fileContent.slice(0, 1000)` 1000자만 저장
  - `content: analysis || fileContent` → AI 분석 요약만 저장, 원본 데이터 손실
  - analyze-file API: `gemini-2.0-flash` 구버전, 3000자 제한
- **해결**:
  - `/api/parse-file` 신규 서버사이드 API 생성
    - PDF: `pdf-parse` 라이브러리 (Node.js runtime) → 실제 텍스트 추출
    - Excel: `xlsx` 라이브러리 `buffer` 모드 → 모든 시트 CSV 변환
  - FileEditor 재작성: 파일→parse-file→analyze-file 순서
  - 저장 시 `AI분석 + 원본데이터 전체(최대 5만자)` 함께 저장
  - analyze-file: `gemini-2.5-flash`, 5000자로 확대
  - merge route: 파일 메모 8000자까지 처리
- **예방책**:
  - ✅ PDF/Excel 등 바이너리 파일은 반드시 서버사이드에서 전용 라이브러리로 파싱
  - ✅ 브라우저 `file.text()`는 텍스트 파일(txt/csv/md)에만 사용
  - ✅ 저장 시 원본 데이터를 충분히 보존할 것 (요약만 저장하면 안됨)

---

## ERR-010: pdfjs-dist DOMMatrix + Worker 오류 (Vercel 배포 환경)
- **날짜**: 2026-03-23
- **심각도**: 🔴 Critical
- **증상**: POST /api/parse-file → 500 "Setting up fake worker failed"
- **원인**:
  1. `pdf-parse` v2.4.5가 `DOMMatrix`를 참조하지만 Node.js에는 없음
  2. `pdfjs-dist` legacy 빌드도 동일하게 DOMMatrix 참조
  3. `workerSrc = ''` 로 설정 시 "No workerSrc specified" 오류
  4. `file://` URL 방식은 Linux에서 "host must be localhost" 오류
  5. `pdfjs-dist` 를 webpack externals로 분리 시 Vercel `/var/task`에서 패키지 없음
- **해결책**:
  ```ts
  // 1. DOMMatrix polyfill 설치
  if (!globalThis.DOMMatrix) { globalThis.DOMMatrix = class DOMMatrix {...} }
  
  // 2. worker를 globalThis.pdfjsWorker에 주입
  // pdfjs #mainThreadWorkerMessageHandler는 globalThis.pdfjsWorker.WorkerMessageHandler를 우선 사용
  if (!globalThis.pdfjsWorker) {
    globalThis.pdfjsWorker = require('pdfjs-dist/legacy/build/pdf.worker.mjs');
  }
  
  // 3. workerSrc는 non-empty 문자열로 설정 (실제로는 globalThis.pdfjsWorker 사용)
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs';
  ```
- **예방**: pdfjs-dist 업그레이드 시 globalThis.pdfjsWorker 주입 방식 유지 여부 확인

---

## ERR-011: PWA 아이콘 404 (/icon-192x192.png)
- **날짜**: 2026-03-23
- **심각도**: 🟡 Minor
- **증상**: 브라우저 콘솔에 `/icon-192x192.png:1 Failed to load resource: 404`
- **원인**: `src/app/layout.tsx`에서 `icon: '/icon-192x192.png'` 를 참조하지만
  실제 파일은 `public/icons/icon-192x192.png` 경로에 있음
- **해결책**: `layout.tsx`의 icons 경로를 `/icons/icon-192x192.png` 로 수정
- **예방**: 아이콘 파일 추가 시 manifest.json과 layout.tsx 경로 동기화 유지
