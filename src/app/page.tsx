import Link from 'next/link';
import { BookOpen, Brain, Search, Zap, ArrowRight, FileText, Network, Image } from 'lucide-react';

const features = [
  {
    icon: FileText,
    title: '텍스트 에디터',
    desc: '헤딩, 리스트, 체크박스, 코드 블록, 표, 이미지 삽입까지 지원하는 풍부한 텍스트 편집기.',
    color: 'text-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-950',
  },
  {
    icon: Network,
    title: '마인드맵 에디터',
    desc: '아이디어를 시각적으로 구조화하고 AI가 마인드맵을 체계적인 위키 문서로 변환합니다.',
    color: 'text-orange-500',
    bg: 'bg-orange-50 dark:bg-orange-950',
  },
  {
    icon: Image,
    title: '이미지 어노테이션',
    desc: '이미지에 화살표, 텍스트, 도형, 블러 처리를 추가해 직관적으로 설명할 수 있습니다.',
    color: 'text-pink-500',
    bg: 'bg-pink-50 dark:bg-pink-950',
  },
  {
    icon: FileText,
    title: '파일 분석',
    desc: 'Excel, CSV, PDF 파일을 업로드하면 AI가 내용을 자동 추출·분석해 메모로 정리합니다.',
    color: 'text-teal-500',
    bg: 'bg-teal-50 dark:bg-teal-950',
  },
  {
    icon: Brain,
    title: 'AI 위키 생성',
    desc: '여러 메모를 선택하면 Gemini AI가 5단계 파이프라인으로 분석·통합해 위키를 자동 생성합니다.',
    color: 'text-purple-500',
    bg: 'bg-purple-50 dark:bg-purple-950',
  },
  {
    icon: Search,
    title: '시맨틱 검색',
    desc: '자연어로 질문하면 pgvector 기반 의미 검색으로 관련 메모와 위키를 정확하게 찾아줍니다.',
    color: 'text-green-500',
    bg: 'bg-green-50 dark:bg-green-950',
  },
];

const steps = [
  { num: '01', title: '메모 작성', desc: '텍스트, 마인드맵, 이미지, 파일 4가지 방식으로 아이디어를 기록하세요.' },
  { num: '02', title: '노트 선택', desc: '대시보드에서 위키로 합칠 메모들을 다중 선택합니다.' },
  { num: '03', title: 'AI 분석', desc: 'Gemini AI가 엔티티 추출·중복 해소·구조 설계 5단계로 메모를 분석합니다.' },
  { num: '04', title: '위키 완성', desc: '목차, 링크, 태그가 포함된 체계적인 위키 문서가 자동으로 완성됩니다.' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-indigo-950">

      {/* Navigation */}
      <nav className="border-b border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-gray-900 dark:text-white text-lg">NoteAI Wiki</span>
            </div>
            <Link href="/login" className="btn-primary text-sm px-5 py-2">
              로그인
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
        <div className="inline-flex items-center gap-2 bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300 rounded-full px-4 py-1.5 text-sm font-medium mb-8">
          <Zap className="w-4 h-4" />
          Gemini 2.5 Flash 기반 AI 위키 생성
        </div>
        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-gray-900 dark:text-white mb-6 leading-tight">
          메모가{' '}
          <span className="bg-gradient-to-r from-primary-600 to-purple-600 bg-clip-text text-transparent">
            위키
          </span>
          가 되다
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 mb-10 max-w-3xl mx-auto leading-relaxed">
          흩어진 메모들을 AI가 분석하고 체계적인 위키 문서로 자동 변환합니다.
          텍스트, 마인드맵, 이미지, 파일 모두 지원합니다.
        </p>
        <Link href="/login" className="inline-flex items-center gap-2 btn-primary px-8 py-3 text-base">
          시작하기
          <ArrowRight className="w-5 h-5" />
        </Link>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            모든 형태의 지식을 하나로
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            4가지 메모 방식과 AI 기반 위키 생성·검색을 지원합니다
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className={`card p-6 ${f.bg} border-0`}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-white dark:bg-gray-900 shadow-sm">
                <f.icon className={`w-6 h-6 ${f.color}`} />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-2 text-lg">{f.title}</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-gray-50 dark:bg-gray-900/50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              4단계로 위키 완성
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-lg">
              메모 작성부터 위키 생성까지 간단한 흐름
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {steps.map((step, i) => (
              <div key={step.num} className="relative text-center">
                <div className="w-14 h-14 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <span className="text-white font-bold text-lg">{step.num}</span>
                </div>
                {i < steps.length - 1 && (
                  <div className="hidden md:flex absolute top-7 left-[calc(50%+2rem)] right-0 items-center justify-center pointer-events-none">
                    <ArrowRight className="w-5 h-5 text-gray-300 dark:text-gray-600" />
                  </div>
                )}
                <h3 className="font-bold text-gray-900 dark:text-white mb-2">{step.title}</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <div className="bg-gradient-to-r from-primary-600 to-purple-600 rounded-3xl p-12 text-white">
          <h2 className="text-3xl font-bold mb-3">지금 바로 시작하세요</h2>
          <p className="text-primary-100 mb-8 text-lg">
            로그인하고 AI 메모 위키를 경험해보세요
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 bg-white text-primary-700 px-8 py-3 rounded-xl font-bold hover:bg-gray-50 transition-colors"
          >
            로그인
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 dark:border-gray-800 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-500 dark:text-gray-400 text-sm">
          <div className="flex items-center justify-center gap-2 mb-2">
            <BookOpen className="w-4 h-4 text-primary-600" />
            <span className="font-bold text-gray-700 dark:text-gray-300">NoteAI Wiki</span>
          </div>
          <p>© 2025 NoteAI Wiki. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}
