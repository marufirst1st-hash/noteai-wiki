# NoteAI Wiki 📝✨

AI가 여러분의 메모를 분석하고 체계적인 위키 문서를 자동으로 생성하는 풀스택 앱

## 🌐 배포 URL
- **Production**: https://noteai-wiki.vercel.app

## ✅ 구현된 기능

### 메모 에디터 (4가지 타입)
- **텍스트**: TipTap v2 리치 에디터 (헤딩/리스트/체크박스/코드블록/표/이미지 삽입)
- **마인드맵**: 커스텀 비주얼 마인드맵 에디터 (노드 추가/삭제/색상 변경, JSON 저장)
- **이미지 어노테이션**: Fabric.js 기반 (화살표/텍스트/사각형/원/자유드로잉 도구)
- **파일 분석**: Excel/CSV/PDF 업로드 → Gemini AI 자동 분석

### Wiki Merge Engine (핵심 기능)
- 여러 노트 다중 선택 → "위키로 합치기" 버튼
- Gemini 2.0 Flash API 5단계 처리:
  1. 멀티모달 파싱 (텍스트+이미지+마인드맵 JSON)
  2. 엔티티 추출 (사람/장소/개념/날짜/키워드)
  3. 중복/충돌 해결
  4. 위키 구조 설계 (TOC 자동 생성)
  5. 마크다운 위키 문서 작성
- SSE 스트리밍으로 실시간 진행 상태 UI 표시

### 시맨틱 검색
- Gemini text-embedding-004 자동 임베딩
- pgvector 코사인 유사도 검색
- 키워드 검색 폴백

### 위키 관리
- 위키 목록 / 상세 페이지
- 마크다운 렌더링 (react-markdown + remark-gfm)
- TOC 사이드바
- 출처 메모 표시

### 인증
- 이메일/비밀번호 로그인
- Google OAuth 소셜 로그인
- Supabase Auth

### PWA
- manifest.json + Service Worker
- 오프라인 페이지
- Dexie.js IndexedDB 지원

## 🛠 기술 스택

- **Frontend**: Next.js 15 + TypeScript + Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL + pgvector)
- **Auth**: Supabase Auth
- **Storage**: Supabase Storage
- **AI**: Gemini 2.0 Flash + text-embedding-004
- **Editor**: TipTap v2
- **Image**: Fabric.js
- **State**: Zustand
- **Deploy**: Vercel

## 📁 프로젝트 구조

```
src/
├── app/
│   ├── api/          # API 라우트 (notes, wiki, merge, search, embed)
│   ├── dashboard/    # 메모 대시보드
│   ├── note/         # 메모 생성/편집
│   ├── wiki/         # 위키 목록/상세
│   ├── search/       # 시맨틱 검색
│   └── login/        # 인증
├── components/
│   ├── editors/      # TextEditor, MindmapEditor, ImageEditor, FileEditor
│   ├── layout/       # AppLayout (사이드바)
│   └── ui/           # MergeModal
├── lib/
│   ├── supabase/     # client, server, admin
│   ├── utils.ts
│   └── db.ts         # Dexie offline DB
├── store/            # Zustand appStore
└── types/            # TypeScript 타입
```

## 🚀 로컬 개발

```bash
# 의존성 설치
npm install

# .env.local 설정 (환경변수 참조)

# 개발 서버
npm run dev

# 빌드
npm run build
```

## 📊 Supabase DB 스키마

테이블: `users`, `notes`, `note_images`, `wiki_pages`, `wiki_history`, `note_wiki_links`, `note_embeddings`, `wiki_embeddings`, `merge_suggestions`, `training_pairs`

Storage 버킷: `images`, `annotated`, `thumbnails`

## 🔧 환경변수

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
NEXT_PUBLIC_APP_URL=
```
