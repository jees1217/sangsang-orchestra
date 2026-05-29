# 상상휠하모니오케스트라 디자인 시스템 (Design System)

이 문서는 상상휠하모니오케스트라 웹 애플리케이션의 일관된 UI/UX를 유지하기 위한 디자인 가이드라인입니다. 
AI 코드 어시스턴트에게 새로운 페이지나 컴포넌트 생성을 요청할 때 **"DESIGN_SYSTEM.md 가이드를 참고해서 만들어줘"**라고 지시하면 이 규칙들이 자동으로 적용됩니다.

## 1. 컬러 팔레트 (Color Palette)

브랜드의 따뜻하고 희망찬 느낌을 전달하기 위해 **청록색(Teal) 그라데이션**과 **네이비(Navy)** 텍스트를 주로 사용합니다.

### Primary Colors (청록색 계열)
- `--primary-color: #00A99D` : 메인 브랜드 컬러
- `--primary-dark: #008F84` : 호버(Hover) 또는 강조 시 사용
- `--primary-light: #E6F7F6` : 연한 배경, 뱃지(Badge) 등에 사용
- `--primary-gradient: linear-gradient(135deg, #00A99D 0%, #00C4B4 50%, #5FD3C8 100%)` : 주요 버튼, 로그인 배경, 중요 헤더 등에 사용

### Accent Colors (포인트 컬러)
- `--accent-color: #F5B731` : 노란색 포인트 (별도 강조가 필요할 때)
- `--accent-light: #FFF4D6` : 연한 노란색 배경

### Text & Neutral Colors
- `--navy: #253243` : 주요 제목(Title) 및 강조 텍스트 색상
- `--text-dark: #253243` : 일반 본문 텍스트
- `--text-mid: #5A6B7D` : 서브 텍스트, 라벨(Label)
- `--bg-color: #F0F8F7` : 애플리케이션 전체의 기본 옅은 회청록색 배경
- `--card-bg: #FFFFFF` : 카드 UI 및 모달의 흰색 배경

## 2. 타이포그래피 (Typography)

전체 애플리케이션의 폰트는 가독성이 뛰어난 **Noto Sans KR**을 사용합니다.
- **Font-Family**: `'Noto Sans KR', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;`
- **Letter-spacing**: `-0.02em` (자간을 살짝 좁혀 모던하고 꽉 찬 느낌을 줌)
- **Title**: `font-weight: 800` (ExtraBold)
- **Button & Label**: `font-weight: 700` (Bold)
- **Body**: `font-weight: 400` ~ `500`

## 3. UI 형태 (Shape & Style)

딱딱한 직각을 피하고 둥글고 부드러운 형태(Rounded)를 지향합니다.

### Border Radius
- `--radius-sm: 10px` : 작은 뱃지, 입력창(Input) 내부
- `--radius-md: 14px` : 기본 버튼(Button), 입력창(Input)
- `--radius-lg: 22px` : 카드(Card) UI, 작은 모달
- `--radius-xl: 28px` : 로그인 박스, 큰 모달

### Box Shadows (그림자)
깊이감을 주어 요소가 화면에서 은은하게 떠있는 느낌을 연출합니다.
- `--shadow-sm: 0 2px 8px rgba(0, 169, 157, 0.06)` : 카드 기본 그림자
- `--shadow-md: 0 4px 16px rgba(0, 169, 157, 0.10)` : 테이블 및 모달 그림자
- `--shadow-hover: 0 8px 24px rgba(0, 169, 157, 0.35)` : 버튼 등에 마우스를 올렸을 때(Hover)의 강한 청록색 그림자

## 4. 반응형 및 모바일 최적화 규칙 (Mobile First)

모바일 기기 해상도(`max-width: 768px`)에서는 아래 규칙을 반드시 준수하여 설계해야 합니다.

1. **입력창 줌(Zoom) 방지**: 
   - 모바일 기기(특히 iOS)에서 `<input>`, `<select>` 태그를 터치했을 때 화면이 강제로 확대되지 않도록 폰트 사이즈를 반드시 `16px` 이상으로 지정합니다.
2. **테이블 가로 스크롤**:
   - 표(Table)가 모바일 화면을 벗어나 찌그러지지 않도록, 테이블 부모 컨테이너에 `overflow-x: auto; -webkit-overflow-scrolling: touch;` 속성을 부여합니다.
3. **사이드바 상단 가로 배치**:
   - 모바일 환경에서 사이드바는 화면 좌측을 덮지 않고, 상단에 위치한 가로형 스크롤 메뉴(`flex-direction: row; overflow-x: auto;`) 형태로 전환되어야 합니다.
4. **패딩(Padding) 및 마진(Margin) 축소**:
   - 모바일 화면에서는 카드 UI의 패딩을 `32px` -> `16px`~`20px` 수준으로 줄여 화면 공간을 확보합니다.
5. **텍스트 숨김 (선택적)**:
   - 공간이 부족한 헤더 영역 등에서는 사용자 이메일과 같이 덜 중요한 텍스트 요소는 `display: none;`으로 숨기고 아이콘/버튼 위주로 배치합니다.

## 5. CSS 모듈(CSS Modules) 작성 가이드
- 전역 설정은 `globals.css`를 참조하며, 각 컴포넌트나 페이지는 `*.module.css` 파일을 분리해서 작성합니다.
- 색상이나 간격은 하드코딩을 최소화하고, 가급적 선언된 CSS 변수(`var(--primary-color)` 등)를 사용합니다.
- Flexbox를 적극 사용하여 요소 간 정렬과 배치를 제어합니다.
