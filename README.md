# chicchicpokpok

전국 기차역 지도와 열차 경로를 탐색하는 기차여행 웹서비스 🚂

PC에서는 검색 패널과 지도를 나란히, 모바일에서는 지도와 펼칠 수 있는 하단 패널로 기차역을 탐색합니다.

처음에는 서울 지역의 역을 보여줍니다. 전국 보기에서는 지도를 확대한 뒤 현재 화면의 역을 표시하며, 지도 표시 수는 최대 40개로 제한합니다. 역 이름을 입력하면 전국 검색으로 시작하고 지역 필터로 좁힐 수 있습니다. 목록은 12개씩 추가로 불러옵니다.

기본 지도에는 전체 운행 경로를 그리지 않습니다. 연결 경로를 검색하면 해당 경로와 그 경로의 역만 표시합니다. 긴 역 소개는 접어 두고 필요한 경우 펼쳐 읽을 수 있습니다.

검색한 연결 경로는 연속된 열차 경로 후보별로 색을 구분하며, 지도·목록·범례에 같은 색상과 구간 번호를 사용합니다. 수집 데이터의 열차번호를 보존하고 같은 정차 순서를 공유하는 여러 편은 후보 목록으로 표시합니다. 색상이 바뀌는 역은 `경로 전환` 지점이며, 역방향으로 연결한 구간은 `방향 미확인`으로 표시합니다. 실제 탑승 열차 선택이나 환승 시간 검증을 수행한 결과는 아닙니다.

## 현재 제공하는 기능

- 이름·지역 검색, 지역 필터, 기차역 선택
- 브라우저에 저장되는 즐겨찾기
- 출발역·도착역 선택과 샘플 철도망의 연결 경로 표시
- Kakao Maps 연동. 키가 없거나 지도 로딩에 실패해도 철도망 미리보기로 탐색 가능

**로컬 기본 데이터는 31개 역·4개 방면의 예시입니다.** 배포 Actions는 승인받은 두 API에서 역과 운행기록을 수집·검증한 뒤 수집 데이터로 빌드합니다. 화면에 데이터 조회일을 표시합니다. 연결 경로는 철도망의 연결 관계이며 실제 직통 운행·환승·소요 시간을 보장하지 않습니다. 실시간 정보나 미래 운행 시간표가 아니며, 관광지와 모바일 앱 패키징은 후속 범위입니다.

## 개발 환경

Node.js 24와 npm을 사용합니다.

```bash
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

개발 주소는 `http://127.0.0.1:5173/chicchicpokpok/`입니다. Vite의 `base`는 GitHub Pages 프로젝트 경로인 `/chicchicpokpok/`으로 설정되어 있습니다.

```bash
npm test       # 샘플 데이터 무결성, 검색, 분기 간 연결 경로
npm run lint
npm run build  # TypeScript 검사와 배포용 번들 생성
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

## Kakao Maps 연결

1. [Kakao Developers](https://developers.kakao.com/)에서 앱을 만들고 카카오맵 사용 설정을 켭니다.
2. Web 플랫폼의 허용 사이트에 개발 시 사용하는 `http://localhost:5173`, `http://127.0.0.1:5173`과 실제 배포 사이트의 origin을 등록합니다. GitHub Pages는 `https://<저장소 소유자>.github.io`를 등록합니다.
3. 클라우드 환경 설정에서 `VITE_KAKAO_MAP_APP_KEY`에 **JavaScript 키**를 입력합니다. 로컬에서는 `.env.example`을 참고해 무시되는 `.env.local`에 설정할 수 있습니다.
4. 개발 서버를 다시 시작합니다. 배포 빌드에는 빌드할 때 변수가 제공되어야 합니다.

이 변수는 브라우저 번들에 포함됩니다. Kakao의 JavaScript 키만 사용하고 REST API 키나 Admin 키는 넣지 않습니다. JavaScript 키의 사용 범위는 Kakao 콘솔의 허용 사이트로 제한합니다. 참고: [Kakao Maps 시작하기](https://apis.map.kakao.com/web/guide/).

## GitHub Pages 배포

`.github/workflows/pages.yml`에 빌드·검사·배포 워크플로가 있습니다. 이 파일을 추가하는 것만으로 사이트가 게시되지는 않습니다.

1. 저장소의 **Settings → Pages → Source**에서 **GitHub Actions**를 선택합니다.
2. 실제 지도를 사용할 경우 **Settings → Secrets and variables → Actions → Variables**에 `VITE_KAKAO_MAP_APP_KEY`를 추가합니다. 클라우드 환경 변수는 GitHub Actions에 자동 복사되지 않습니다.
3. **Actions → Secrets**에 공공데이터포털의 공통 인증키를 `DATA_GO_KR_SERVICE_KEY`로 등록합니다. 두 API에 대한 활용신청 승인이 각각 필요합니다. 이 키는 Vite에 전달하지 않습니다.
4. 변경을 `main`에 반영하거나 Actions에서 **Deploy GitHub Pages**를 직접 실행합니다. 수동 실행의 `data_date`에는 `YYYYMMDD`를 지정할 수 있으며 기본 조회일은 한국시간 전날입니다. 조회 결과가 없으면 제공되는 날짜를 확인해 다시 실행합니다.

데이터 수집이나 검증이 실패하면 새 배포를 중단합니다. GitHub에 저장된 인증키는 이 클라우드에서 조회하지 않습니다. 실제 API 인증·최신 응답 형식·날짜별 데이터 제공 여부는 첫 Actions 실행으로 확인해야 합니다.

기본 주소는 `https://<저장소 소유자>.github.io/chicchicpokpok/`입니다. 현재 선택된 저장소 이름 `ImDongHo/chicchicpokpok` 기준으로는 `https://imdongho.github.io/chicchicpokpok/`이며, `imtongho1` 계정의 주소를 사용하려면 저장소도 해당 계정 소유여야 합니다. 배포 성공 여부는 저장소 Actions에서 확인합니다.

## 데이터 교체

`scripts/collect-railway-data.mjs`는 다음 API의 전체 페이지를 수집합니다.

- 국가철도공단\_철도역 정보: ODCloud `15067652/v1`, 2025-07-11 버전. 역 이름·좌표·주소를 사용합니다. [공식 명세](https://infuser.odcloud.kr/oas/docs?namespace=15067652/v1)
- 한국철도공사\_열차운행정보: `https://apis.data.go.kr/B551457/run/v2`의 `travelerTrainRunPlan2`, `travelerTrainRunInfo2`. 조회일을 하나로 고정하고 역 필터 없이 운행계획과 정차정보를 수집합니다.

발급받은 키가 환경에 안전하게 제공된 경우 `npm run data:collect`로도 실행할 수 있습니다. 선택적 `RAILWAY_DATA_DATE`는 `YYYYMMDD` 형식입니다. 로그에는 인증키나 인증 URL을 출력하지 않으며 TLS 검증을 유지합니다.

수집기는 총 건수·페이지 반복·조회일·스키마를 검증합니다. 동일 날짜·열차의 출발/종착 코드가 운행계획과 일치하고 정차 순서가 완전하며 여객 정차역 좌표를 모두 찾은 열차만 연결망에 포함합니다. 누락·중복 순서·모호한 역명·좌표 누락이 있는 열차는 제외하며, 유효한 열차가 하나도 없으면 배포를 중단합니다. 최신 API가 필드명이나 순서 의미를 바꾸면 명세를 확인해 수집기를 수정해야 합니다.

생성 결과는 무시되는 `src/data/generated/railway.json`과 `public/data/railway/trips.json`입니다. 수집 결과가 있는 빌드는 `src/data/railway.ts`를 통해 해당 데이터를 사용합니다. 생성 파일이 없는 로컬 개발은 `src/data/sample-railway.ts`의 예시를 사용합니다. `src/lib/railway.ts`의 연결 그래프는 시간표 기반 여행 경로 계산기가 아닙니다. 실제 선로 형상·운행 방향·실제 환승·이용 조건은 별도 검증이 필요합니다.

초기 버전은 서버·DB·외부 관광 API 없이 동작합니다. iOS 앱 빌드와 스토어 출시는 별도의 macOS/Xcode 환경과 검증이 필요합니다.

## 지도 표시 성능

Kakao 지도의 `idle` 이벤트에서 화면 범위를 반영하고 표시할 역을 제한합니다. 이미 보이는 역의 오버레이는 재사용하며, 선택 상태 변경에는 스타일만 갱신합니다. 검색한 경로의 폴리라인은 역 오버레이와 별도로 관리합니다. 전국 운행 경로를 기본으로 모두 생성하거나 역을 선택할 때 전체 오버레이를 다시 만드는 방식으로 되돌리지 않아야 합니다.
