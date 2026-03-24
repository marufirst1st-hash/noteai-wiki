/**
 * POST /api/merge  → /api/wiki/merge 로 위임
 * 하위 호환성 유지 (기존 MergeModal이 이 경로 사용)
 */
import { NextRequest } from 'next/server';
import { POST as wikiMerge } from '../wiki/merge/route';

export async function POST(req: NextRequest) {
  return wikiMerge(req);
}
