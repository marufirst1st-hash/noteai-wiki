# 개발 가이드라인 (DEVELOPMENT.md)

NoteAI Wiki 프로젝트의 개발 규칙과 절차를 정의합니다.

---

## 1. 버전 관리 전략

### 브랜치 구조
```
main          ← 프로덕션 (Vercel 자동 배포)
dev           ← 개발 통합 브랜치
feature/xxx   ← 기능 개발
fix/xxx       ← 버그 수정
hotfix/xxx    ← 긴급 수정 (main에서 직접 분기)
```

### 커밋 메시지 규칙
```
feat: 새 기능 추가
fix: 버그 수정
docs: 문서 변경
refactor: 코드 리팩토링 (기능 변경 없음)
style: 스타일/포맷 변경
test: 테스트 추가/수정
chore: 빌드/설정 변경
```

### 버전 태깅 규칙
```bash
# 새 버전 태그 생성
git tag -a v1.1.0 -m "feat: 새 기능 설명"
git push origin v1.1.0

# 모든 태그 푸시
git push origin --tags

# 특정 버전으로 롤백
git checkout v1.0.0
```

### 시맨틱 버저닝
| 상황 | 버전 변경 | 예시 |
|---|---|---|
| 버그 수정 / 보안 패치 | PATCH | 1.0.0 → 1.0.1 |
| 새 기능 (하위 호환) | MINOR | 1.0.0 → 1.1.0 |
| 파괴적 변경 / DB 대규모 변경 | MAJOR | 1.0.0 → 2.0.0 |

---

## 2. 배포 절차

### 일반 배포
```bash
# 1. 브랜치 확인
git status && git log --oneline -3

# 2. 빌드 테스트
cd /home/user/webapp && npm run build

# 3. 커밋 & 푸시
git add -A
git status   # ← 대용량 파일 없는지 반드시 확인!
git commit -m "fix: 설명"
git push origin main

# 4. Vercel 자동 배포 대기 (약 60-90초)

# 5. 배포 확인
curl -s -o /dev/null -w "%{http_code}" https://noteai-wiki.vercel.app/

# 6. 버전 태그 생성 (기능 추가 / 중요 수정 시)
git tag -a v1.0.1 -m "fix: 버그 설명"
git push origin v1.0.1
```

### 긴급 롤백
```bash
# Vercel 대시보드에서 즉시 롤백 (권장)
# https://vercel.com/marufirsts-projects/noteai-wiki

# 또는 Git으로 롤백
git revert HEAD   # 마지막 커밋 취소 (새 커밋 생성)
git push origin main
```

---

## 3. DB 스키마 변경 절차

> ⚠️ DB 스키마 변경은 가장 위험한 작업입니다. 반드시 아래 절차를 따르세요.

### 변경 전 체크리스트
```
□ 현재 테이블 컬럼 목록 확인 (ERRORS.md 스키마 현황 참조)
□ 변경이 기존 데이터에 미치는 영향 분석
□ 롤백 SQL 미리 작성
□ Supabase 대시보드에서 수동 백업
```

### 변경 절차
```bash
# 1. migrations/ 폴더에 SQL 파일 생성
mkdir -p /home/user/webapp/supabase/migrations
cat > /home/user/webapp/supabase/migrations/YYYYMMDD_description.sql << 'EOF'
-- Up Migration
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS new_column TEXT;

-- Down Migration (롤백용 주석으로 보존)
-- ALTER TABLE public.notes DROP COLUMN IF EXISTS new_column;
EOF

# 2. Supabase SQL Editor에서 실행
# https://supabase.com/dashboard/project/tquxtsunryheokmgkbrk/editor

# 3. 코드의 타입 정의 업데이트
# src/types/index.ts 수정

# 4. ERRORS.md의 DB 스키마 현황 업데이트

# 5. 커밋
git add -A && git commit -m "chore: DB migration - 설명"
```

---

## 4. 환경변수 목록

| 변수명 | 용도 | 위치 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | Vercel 환경변수 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 공개 키 | Vercel 환경변수 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 관리자 키 | Vercel 환경변수 (노출 금지) |
| `GEMINI_API_KEY` | Google Gemini API | Vercel 환경변수 (노출 금지) |
| `NEXT_PUBLIC_APP_URL` | 앱 기본 URL | Vercel 환경변수 |

> 🔒 `_KEY`, `_SECRET` 접두/후미 변수는 절대 프론트엔드 코드에 노출 금지

---

## 5. 프로젝트 구조

```
noteai-wiki/
├── src/
│   ├── app/
│   │   ├── api/           ← 서버사이드 API Routes
│   │   │   ├── admin/     ← 관리자 전용 API
│   │   │   ├── notes/     ← 메모 CRUD
│   │   │   ├── wiki/      ← 위키 CRUD
│   │   │   ├── merge/     ← AI 위키 생성
│   │   │   ├── search/    ← 시맨틱 검색
│   │   │   └── embed/     ← 임베딩 생성
│   │   ├── admin/         ← 관리자 페이지 (관리자만 접근)
│   │   ├── dashboard/     ← 메인 대시보드
│   │   ├── note/          ← 메모 상세/편집
│   │   ├── wiki/          ← 위키 목록/상세
│   │   ├── search/        ← 검색 페이지
│   │   └── login/         ← 로그인 페이지
│   ├── components/
│   │   ├── editors/       ← 4종 에디터 컴포넌트
│   │   ├── layout/        ← AppLayout (사이드바)
│   │   └── ui/            ← 공통 UI 컴포넌트
│   ├── hooks/             ← useAdmin 등 커스텀 훅
│   ├── lib/
│   │   └── supabase/      ← client/server/admin 클라이언트
│   └── types/             ← TypeScript 타입 정의
├── supabase/
│   └── migrations/        ← DB 마이그레이션 SQL 파일
├── public/                ← 정적 파일 (아이콘, manifest)
├── CHANGELOG.md           ← 버전별 변경 내역
├── ERRORS.md              ← 오류 기록부
└── DEVELOPMENT.md         ← 이 파일
```

---

## 6. 관리자 계정

| 이메일 | 비밀번호 | 권한 |
|---|---|---|
| `maru1st@noteai-wiki.com` | `whehdwls84` | 관리자 |
| `admin@noteai-wiki.com` | `NoteAI@Admin2025!` | 관리자 (백업) |

> 회원 관리: https://supabase.com/dashboard/project/tquxtsunryheokmgkbrk/auth/users

---

## 7. 주요 URL

| 구분 | URL |
|---|---|
| 프로덕션 앱 | https://noteai-wiki.vercel.app |
| Vercel 대시보드 | https://vercel.com/marufirsts-projects/noteai-wiki |
| GitHub 저장소 | https://github.com/marufirst1st-hash/noteai-wiki |
| Supabase 대시보드 | https://supabase.com/dashboard/project/tquxtsunryheokmgkbrk |
| Supabase SQL Editor | https://supabase.com/dashboard/project/tquxtsunryheokmgkbrk/editor |
