import Link from 'next/link';
import { BookOpen, Brain, Search, Zap, ArrowRight, CheckCircle, FileText, Network, Image, Upload } from 'lucide-react';

const features = [
  {
    icon: FileText,
    title: '4가지 메모 타입',
    desc: '텍스트, 마인드맵, 이미지 어노테이션, 파일 분석까지 다양한 형식으로 메모하세요.',
    color: 'text-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-950',
  },
  {
    icon: Brain,
    title: 'AI 위키 생성',
    desc: 'Gemini AI가 여러 메모를 분석하여 체계적인 위키 문서를 자동으로 생성합니다.',
    color: 'text-purple-500',
    bg: 'bg-purple-50 dark:bg-purple-950',
  },
  {
    icon: Search,
    title: '시맨틱 검색',
    desc: '자연어로 질문하면 관련 메모와 위키를 의미 기반으로 정확하게 찾아줍니다.',
    color: 'text-green-500',
    bg: 'bg-green-50 dark:bg-green-950',
  },
  {
    icon: Network,
    title: '마인드맵 에디터',
    desc: '아이디어를 시각적으로 구조화하고 AI가 마인드맵을 위키로 변환합니다.',
    color: 'text-orange-500',
    bg: 'bg-orange-50 dark:bg-orange-950',
  },
  {
    icon: Image,
    title: '이미지 어노테이션',
    desc: 'Fabric.js 기반 이미지 편집기로 화살표, 텍스트, 도형을 그려 설명하세요.',
    color: 'text-pink-500',
    bg: 'bg-pink-50 dark:bg-pink-950',
  },
  {
    icon: Zap,
    title: 'PWA 오프라인',
    desc: '인터넷 없이도 메모 작성 가능. 온라인 복귀 시 자동으로 동기화됩니다.',
    color: 'text-yellow-500',
    bg: 'bg-yellow-50 dark:bg-yellow-950',
  },
];

const steps = [
  { num: '01', title: '메모 작성', desc: '텍스트, 마인드맵, 이미지, 파일 4가지 방식으로 아이디어를 기록하세요.' },
  { num: '02', title: '노트 선택', desc: '대시보드에서 위키로 합칠 메모들을 다중 선택합니다.' },
  { num: '03', title: 'AI 분석', desc: 'Gemini AI가 5단계로 메모를 분석하고 통합합니다.' },
  { num: '04', title: '위키 완성', desc: '체계적인 위키 문서가 자동으로 생성되어 공유 가능합니다.' },
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
            <div className="flex items-center gap-3">
              <Link href="/login" className="btn-secondary text-sm px-4 py-2">
                로그인
              </Link>
              <Link href="/login?mode=signup" className="btn-primary text-sm px-4 py-2">
                무료 시작하기
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
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
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/login?mode=signup" className="btn-primary px-8 py-3 text-base">
            무료로 시작하기
            <ArrowRight className="ml-2 w-5 h-5" />
          </Link>
          <Link href="/dashboard" className="btn-secondary px-8 py-3 text-base">
            데모 보기
          </Link>
        </div>
        <div className="flex items-center justify-center gap-6 mt-8 text-sm text-gray-500">
          {['신용카드 불필요', '즉시 사용 가능', '무료 플랜 포함'].map((item) => (
            <div key={item} className="flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-green-500" />
              {item}
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            모든 형태의 지식을 하나로
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            다양한 메모 형식을 지원하고 AI로 통합합니다
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className={`card p-6 ${f.bg} border-0`}>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-white dark:bg-gray-900 shadow-sm`}>
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
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {steps.map((step, i) => (
              <div key={step.num} className="text-center">
                <div className="w-14 h-14 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <span className="text-white font-bold text-lg">{step.num}</span>
                </div>
                <h3 className="font-bold text-gray-900 dark:text-white mb-2">{step.title}</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">{step.desc}</p>
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute mt-[-3rem] ml-[8rem]">
                    <ArrowRight className="w-6 h-6 text-gray-300" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <div className="bg-gradient-to-r from-primary-600 to-purple-600 rounded-3xl p-12 text-white">
          <h2 className="text-3xl font-bold mb-4">지금 바로 시작하세요</h2>
          <p className="text-primary-100 mb-8 text-lg">
            AI와 함께하는 새로운 메모 경험
          </p>
          <Link href="/login?mode=signup" className="inline-flex items-center gap-2 bg-white text-primary-700 px-8 py-3 rounded-xl font-bold hover:bg-gray-50 transition-colors">
            무료로 시작하기
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 dark:border-gray-800 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-500 text-sm">
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
