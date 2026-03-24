// 앱 버전 — package.json과 동기화 유지
export const APP_VERSION = '1.0.0';

// 변경 이력 (최신순)
export const CHANGELOG: { version: string; date: string; changes: string[] }[] = [
  {
    version: '1.0.0',
    date: '2026-03-24',
    changes: [
      '아키텍처 전면 재설계: 3단계 파이프라인 (1-메모정리, 2-통합위키병합, 3-재정비)',
      '메모 상세 페이지: AI 정리 버튼 (1-1가) + 위키화 버튼 (1-2) 추가',
      '통합 위키 병합: 중복 확인 후 섹션별 정확 삽입',
      '위키 페이지: AI 재정비 버튼 (3단계: 중복제거+목차재정비+흐름개선)',
      '새 API: /api/note/refine, /api/wikify, /api/wiki/merge, /api/wiki/consolidate',
    ],
  },
  {
    version: '0.9.3',
    date: '2026-03-24',
    changes: [
      '하이퍼링크 앵커 매칭 4단계 강화 (연속하이픈·숫자기호·fuzzy)',
      'scrollToAnchor: 2024~2025 형태 특수기호 포함 링크도 정확 매칭',
    ],
  },
  {
    version: '0.9.0',
    date: '2026-03-24',
    changes: [
      '위키 업데이트 아키텍처 개선 (AI 요약 방지)',
      '위키 삭제 기능 + 버전 표시 + 오류 로그 패널',
    ],
  },
  {
    version: '0.8.0',
    date: '2026-03-24',
    changes: [
      '위키 TOC(목차) + 앵커 하이퍼링크 구현',
      'maxTokens 8192 → 16384 확장',
    ],
  },
];
