import Link from 'next/link'

export default function Home() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#fdfbf7' }}>
      {/* 로고나 인사말 */}
      <h1 style={{ fontSize: '2.5rem', color: '#2c3e50', marginBottom: '10px', textAlign: 'center' }}>
        상상휠 하모니
      </h1>
      <p style={{ fontSize: '1.1rem', color: '#7f8c8d', marginBottom: '30px', textAlign: 'center' }}>
        오케스트라 단원 및 강사 전용 시스템
      </p>
      
      {/* 로그인 페이지로 가는 버튼 */}
      <Link 
        href="/login" 
        style={{ 
          padding: '12px 30px', 
          backgroundColor: '#38b2ac', 
          color: 'white', 
          textDecoration: 'none', 
          borderRadius: '8px', 
          fontSize: '1.2rem', 
          fontWeight: 'bold',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}
      >
        로그인 하러가기
      </Link>
    </div>
  )
}