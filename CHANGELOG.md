# 변경 이력 (CHANGELOG.md)

모든 주요 변경 사항을 이 파일에 기록합니다.  
형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.0.0/)를 따르며,  
버전은 [Semantic Versioning](https://semver.org/lang/ko/)을 따릅니다.

---

## [Unreleased]
> 다음 릴리즈에 포함될 예정인 변경 사항

---

## [v1.0.0] - 2026-03-23

### 🎉 초기 릴리즈 — NoteAI Wiki 전체 기능 완성

#### Added (추가)
- **메모 시스템** — 4종 에디터 (텍스트, 이미지, 마인드맵, 파일)
- **위키 시스템** — AI 기반 메모→위키 자동 변환 (Gemini 2.0 Flash)
- **시맨틱 검색** — `text-embedding-004` 기반 벡터 검색
- **관리자 페이지** (`/admin`) — 회원 목록/추가/수정/삭제
- **권한 분리** — admin/일반 사용자 미들웨어 보호
  - 관리자: 전체 기능 + 메모 수정/삭제 + 관리자 페이지
  - 일반 사용자: 조회 + 메모 생성만 가능
- **인증** — Supabase Auth (이메일 로그인, 회원가입 숨김)
- **사이드바** — 관리자 전용 왕관 아이콘 메뉴 표시
- **Vercel 배포** — GitHub 연동 자동 배포 설정

#### Fixed (수정)
- **DB 스키마 불일치** (ERR-001) — `content_json`/`raw_text`→`content` 매핑 변환 함수 추가
- **core dump 커밋** (ERR-002) — `.gitignore`에 `core`, `core.*` 패턴 추가
- **Next.js CVE-2025-66478** (ERR-005) — `next@15.1.0` → `next@15.3.9` 업그레이드
- **노트 저장 500 오류** — API에서 `normalizeNote()` / `denormalizeNote()` 변환 적용
- **note_images 컬럼 불일치** — `public_url`→`original_url`, `annotation_data`→`fabric_json`
- **embed API** — `chunk_text` NOT NULL 처리, vector 타입 포맷 수정
- **Google 로그인 제거** — 이메일 로그인만 유지

#### Security (보안)
- `/admin` 경로 미들웨어에서 관리자 권한 검증 추가
- 서버사이드 API 전체에 `verifyAdmin()` 인증 함수 적용
- 관리자 자기 자신 삭제 방지 로직 추가

#### Documentation (문서)
- `ERRORS.md` — 오류 기록부 및 DB 스키마 현황 생성
- `DEVELOPMENT.md` — 개발 가이드라인 생성
- `README.md` — 프로젝트 개요 및 배포 정보 업데이트

---

## [v0.1.0] - 2026-03-23 (초기 구현)

### Added
- NoteAI Wiki 풀스택 앱 초기 구현
  - Next.js 15 + TypeScript + Tailwind CSS
  - Supabase (Auth + DB + Storage) 연동
  - 4종 에디터 컴포넌트 (TextEditor, ImageEditor, MindmapEditor, FileEditor)
  - 위키 생성 AI 파이프라인
  - 대시보드, 메모 상세, 위키 상세 페이지
  - Vercel 배포 설정 (vercel.json)

---

## 롤백 방법

```bash
# 특정 버전으로 코드 확인
git checkout v1.0.0

# Vercel 롤백 (대시보드 권장)
# https://vercel.com/marufirsts-projects/noteai-wiki
# → Deployments → 이전 배포 → "Redeploy" 클릭

# 또는 Git revert
git revert <commit-hash>
git push origin main
```

---

## 버전 태그 목록

| 버전 | 날짜 | 주요 내용 |
|---|---|---|
| v1.0.0 | 2026-03-23 | 전체 기능 완성, DB 스키마 수정, 관리자 기능 |
| v0.1.0 | 2026-03-23 | 초기 구현 |
