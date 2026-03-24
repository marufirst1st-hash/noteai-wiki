// 앱 버전 — package.json과 동기화 유지
export const APP_VERSION = '0.9.1';

// 변경 이력 (최신순)
export const CHANGELOG: { version: string; date: string; changes: string[] }[] = [
  {
    version: '0.9.1',
    date: '2026-03-24',
    changes: [
      '위키 목록(/wiki) 페이지에 삭제 버튼 추가',
      '위키 삭제 버튼 미표시 버그 수정 (isOwner RLS 문제)',
      '버전 표시 + 오류 로그 패널 추가',
    ],
  },
  {
    version: '0.9.0',
    date: '2026-03-24',
    changes: [
      '위키 업데이트 아키텍처 전면 개선 (AI 요약 방지)',
      'AI 역할 분리: 새 내용 변환만 담당, 코드에서 섹션 병합',
      '위키 삭제 기능 추가 (본인 위키 삭제 + 2단계 확인)',
    ],
  },
  {
    version: '0.8.0',
    date: '2026-03-24',
    changes: [
      '위키 TOC(목차) + 앵커 하이퍼링크 완전 구현',
      '섹션별 정확한 병합 로직 (기존 위키 12000자까지 전달)',
      'maxTokens 8192 → 16384 확장',
    ],
  },
  {
    version: '0.7.0',
    date: '2026-03-24',
    changes: [
      '파일 처리 플로우 재설계 (원본 텍스트 저장)',
      'analyze-file 호출 제거, parse-file 텍스트만 저장',
    ],
  },
  {
    version: '0.6.0',
    date: '2026-03-23',
    changes: [
      'Gemini 모델 전체 교체 (2.5-flash-lite, gemini-embedding-001)',
      '429 재시도 지수 백오프 추가',
      '이미지 분석 병렬 → 순차 처리',
    ],
  },
];
