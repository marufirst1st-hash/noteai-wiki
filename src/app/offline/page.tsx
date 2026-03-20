export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="text-center">
        <div className="text-6xl mb-4">📴</div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">오프라인 상태</h1>
        <p className="text-gray-500 mb-6">인터넷 연결을 확인해주세요. 오프라인에서도 메모를 작성할 수 있습니다.</p>
        <a href="/note/new" className="btn-primary inline-flex">
          오프라인 메모 작성
        </a>
      </div>
    </div>
  );
}
