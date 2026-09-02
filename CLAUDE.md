# 포트폴리오 원장 — 프로젝트 인수인계서 (CLAUDE.md)

> 이 파일은 Claude Code가 저장소를 열 때 자동으로 읽는 컨텍스트 파일이에요.
> Claude.ai 채팅에서 진행하던 개발을 이 저장소로 이어받아 작업할 때 참고하세요.

## 1. 프로젝트 개요

**이름**: 포트폴리오 원장
**목적**: 한국(KRX)·미국 주식을 함께 관리하는 개인용 포트폴리오 트래커
**형태**: 빌드 과정 없는 **단일 HTML 파일** (Vanilla JS, 프레임워크 없음)
**배포**: GitHub Pages (정적 호스팅)
**백엔드**: Supabase (PostgreSQL + Auth), 없으면 Claude 아티팩트의 `window.storage`로 자동 대체

**실제 서비스 주소**: https://myeonggyu77.github.io/portfolio-tracker/portfolio-tracker.html
**GitHub 저장소**: myeonggyu77/portfolio-tracker

## 2. 파일 구조 (저장소 최상위)

| 파일 | 역할 |
|---|---|
| `portfolio-tracker.html` | 앱 본체 (전부 이 파일 하나) |
| `setup.sql` | Supabase 테이블·RLS 정책 생성 스크립트 (최초 1회 실행) |
| `krx-lookup.ts` | (선택) 한국거래소 공식 데이터 조회용 Supabase Edge Function 소스 |
| `manifest.json` | PWA 매니페스트 |
| `sw.js` | PWA 서비스워커 (앱 셸 캐싱) |
| `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `apple-touch-icon.png` | PWA 아이콘 |

## 3. 백엔드/외부 연동 설정값

`portfolio-tracker.html` 상단 `BACKEND CONFIG` 섹션에 이미 채워져 있어요.

```javascript
const SUPABASE_URL = 'https://kcmqzinekvikpmlxkdxf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_rZ6bmiQGScI6YewuRg_5aw_PijLpbkl'; // publishable key, 공개돼도 안전
const GOOGLE_SHEET_ID = '1I1UvIrxYAo6XNTwI0pfn08EWVNJPTjTcjG4XPw-C3OI';
const GOOGLE_SHEET_NAME = ''; // 비워두면 첫 번째 탭 사용
```

- 이 프로젝트는 사용자의 **메인/원본 Supabase 프로젝트**로, 기존 데이터가 전부 여기 저장돼 있어요. **다른 프로젝트로 절대 바꾸지 마세요** (실수로 새 프로젝트를 만들었던 적이 있어요 — 반드시 이 프로젝트 유지).
- 구글시트에는 두 개의 탭이 있어요:
  - **기본 탭**: A=종목코드, B=종목명(=GOOGLEFINANCE), C=현재가(=GOOGLEFINANCE)
  - **KRW 탭**: A=일자, B=환율 — `=GOOGLEFINANCE("CURRENCY:USDKRW","close",DATE(2025,1,1),TODAY())` 수식 하나로 구성. **이 탭이 실제로 만들어졌는지 반드시 재확인 필요** (사용자가 수동으로 추가하기로 했던 항목이라 완료 여부 미확인).
- KRX Edge Function(`krx-lookup.ts`)은 **선택 사항**이에요. Supabase Edge Functions에 `krx-lookup`이라는 이름으로 배포하고, Secrets에 `DATA_GO_KR_KEY`(공공데이터포털 인증키)를 등록해야 작동해요. **배포 여부 미확인 — 확인 필요**. 배포 안 돼 있어도 앱은 정상 작동해요 (구글시트 → stooq.com 순으로 자동 대체).

## 4. 데이터 모델 (Supabase `portfolio_data` 테이블, 1행짜리 JSON 저장)

| 컬럼 | 내용 |
|---|---|
| `transactions` | 한국+미국 매매내역 통합 배열. `{id, date, account, country, code, name, side, ccy, qty, price, source}` |
| `dividends_kr` | 한국 배당금. `{id, account, code, name, date, shares, rate}` |
| `dividends_us` | 미국 배당금. `{id, account, code, name, date, shares, rate, appliedRate}` |
| `dividend_status` | 배당현황(배당락일 기준). `{id, exDate, payDate, country, code, name, krwAmount, usdAmount}` |
| `current_prices` | 보유종목 현재가 수동/자동 입력값. key = `종목코드(또는 정규화된 이름)+"|"+통화` |

**주의**: `fx_records` 컬럼이 테이블에 남아있지만 **더 이상 사용하지 않아요** (환전내역 탭 삭제됨, 아래 6번 참고). 데이터 마이그레이션 불필요, 그냥 무시하면 돼요.

`side` 값 종류: `buy`, `sell`, `split_buy`(액면분할매수), `split_sell`(액면분할매도), `merge_buy`(액면병합매수), `merge_sell`(액면병합매도).

## 5. 핵심 설계 결정 사항

1. **종목 매칭은 종목명 기준(2026-08 변경)**: `itemKey(obj)` 함수가 `normName(obj.name)`(공백 제거 + 대문자 통일)만으로 매칭해요. 보유종목 집계·배당 합산·평균매입가 계산 전부 이 함수를 통해요. **종목코드는 더 이상 매칭에 쓰이지 않아요** — 현재가 자동조회(KRX Edge Function/stooq)를 위해 내부적으로만 각 레코드에 보관돼요.
2. **종목코드 입력칸은 화면에서 완전히 제거됨**: 한국·미국 매매내역/배당금/배당현황 5개 탭 전부 "종목명" 입력 하나로 통일. `resolveStockByName(name, country)` 함수가 저장 시점에 구글시트 → 내장 KR_STOCK_MAP → 과거 저장 기록 순으로 훑어서 (a) 구글시트에 등록된 표준 이름으로 자동 보정하고 (b) 내부용 종목코드를 같이 찾아 채워요. 못 찾으면 입력한 이름 그대로, 코드는 빈 값으로 저장돼요.
3. **종목명 자동완성(검색) 목록**: `kr-name-datalist`/`us-name-datalist`/`all-name-datalist` — 구글시트 전체 목록(설정된 경우) + 지금까지 입력했던 이름을 합쳐서 매번 갱신해요(`refreshAutocompleteLists()`). 미국은 티커(AAPL)와 회사명(Apple Inc.) 둘 다 목록에 들어가고 둘 다 입력 가능해요.
4. **매수/매도 판별**: `isBuySide(side)`가 `buy`/`split_buy`/`merge_buy`를 "매수 계열"로 취급해 보유수량을 늘리고, 나머지는 "매도 계열"로 줄여요. 액면분할·병합은 체결가 0원 입력이 허용돼요(일반 매수/매도는 0원 불가).
5. **로그인**: Supabase Auth(이메일/비밀번호), RLS로 `authenticated` 역할만 데이터 접근 가능. `persistSession: false`라서 새로고침마다 재로그인 필요(보안을 위한 의도적 설계).
6. **현재가 자동조회 우선순위**: 구글시트 → KRX Edge Function(설정된 경우, 한국만) → stooq.com(최종 폴백). 실패해도 수동 입력 가능. 조회에 필요한 종목코드는 위 2번의 내부 보관 값을 사용해요.
7. **환율정보**: 구글시트 "KRW" 탭에서 매번 새로 불러오는 방식(Supabase에 저장 안 함). `loadFxRates()` 참고.
8. **환전내역 탭은 삭제됨**: 사용자 요청으로 완전히 제거하고 "환율정보" 탭(구글시트 기반, 읽기 전용)으로 대체됐어요.
9. **일괄등록/엑셀 업로드는 종목명 칼럼**(2026-08 변경): 예전엔 종목코드만 입력받았지만 지금은 종목명을 입력받아요. 저장 시 2번과 동일하게 `resolveStockByName`으로 이름 보정 + 코드 내부 채움이 일어나요.

## 6. 구현된 주요 기능 (전체 히스토리 요약)

- 탭: 보유종목 / 한국·미국 매매내역 / 한국·미국 배당금 / 환율정보 / 배당현황
- 로그인/로그아웃 (Supabase Auth)
- 각 탭 검색(전체 텍스트), 체크박스 다중 선택 + 전체선택 + 선택삭제, 개별 삭제 시 확인창
- 표 헤더 고정(세로 스크롤 시 상단 고정, 가로 스크롤로 좁은 화면 대응)
- 종목명 칼럼 폭 180px 통일(보유종목/한국매매내역/한국배당금/배당현황)
- 계좌·종목명 입력 시 검색형 자동완성(datalist, 구글시트 전체 목록 + 입력 이력), `autocomplete="off"`로 iOS 연락처 자동완성 충돌 방지
- 달러 표시: 배당현황 탭만 소수점 5자리(끝자리 0 생략), 나머지는 2자리 고정
- 현재가 입력칸: 평상시엔 포맷된 텍스트처럼, 클릭하면 순수 숫자로 편집
- 마스트헤드 빠른조회 2종: ① 날짜별 환율 조회 ② 종목명+배당락일로 배당금 조회 (둘 다 결과 초록색 표시)
- CSV 일괄등록/다운로드, 엑셀 파일 업로드, 전체 백업/복원(JSON)
- PWA(홈 화면 설치) 지원

## 7. 확인이 필요한 미해결 항목

- [ ] 구글시트에 **KRW 탭**이 실제로 만들어졌는지 확인 (환율정보 탭 작동 전제조건)
- [ ] **KRX Edge Function** 배포 여부 확인 (선택 기능, 안 돼 있어도 무방)
- [ ] 사용자가 "환율 검색 다음줄 배당금 조회" 요청 후 실제 배포·테스트 완료했는지 확인
- [ ] PWA 아이콘 4종 + manifest.json + sw.js가 GitHub 저장소에 실제로 업로드됐는지 확인

## 8. 다음 단계 후보 (사용자가 관심 표명했던 것)

- **Capacitor로 감싸서 앱스토어/플레이스토어 정식 출시** — 이 저장소의 HTML을 그대로 재사용 가능. 다만 iOS는 맥+Xcode+애플 개발자 계정, 안드로이드는 Android Studio가 필요해서 로컬 환경에서 진행해야 해요.

## 9. 작업 시 유의사항

- 이 프로젝트는 **빌드 도구가 없어요**. `portfolio-tracker.html`을 직접 수정하고 그대로 GitHub에 커밋하면 배포 끝(GitHub Pages가 자동 반영, 1~2분 소요).
- 새 기능 추가 시 데이터 구조가 바뀌면(`setup.sql`에 새 컬럼 필요) 사용자에게 Supabase SQL Editor에서 실행할 ALTER TABLE 구문을 안내해야 해요.
- 사용자는 코딩 경험이 없는 초보자예요. 설명은 쉽게, 단계별로, 스크린샷 요청에는 실제 화면과 최대한 비슷하게 안내해주세요.
