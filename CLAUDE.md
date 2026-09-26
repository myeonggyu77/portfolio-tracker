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
| `vocabulary.html` | (2026-09 추가) **영어 단어장** 앱 본체. 포트폴리오 원장과 완전히 독립된 별도 앱이지만 같은 저장소·같은 Supabase 프로젝트·같은 로그인 계정을 공유해요. 자세한 내용은 10번 항목 참고. |
| `dict-lookup.ts` | (선택) 단어장의 "뜻 자동조회" 기능용 Supabase Edge Function 소스. 구글 번역(비공식) 중계 서버, 키 발급 불필요. |
| `vocabulary-manifest.json` | (2026-09 말 추가) 단어장 전용 PWA 매니페스트. `manifest.json`(포트폴리오 원장용)과 별개 파일 — 아이콘은 기존 4종을 그대로 재사용해요. |
| `vocabulary-sw.js` | (2026-09 말 추가) 단어장 전용 PWA 서비스워커 (앱 셸 캐싱). `sw.js`(포트폴리오 원장용)와 같은 구조, 파일만 분리. |

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
- 이 Supabase 프로젝트(`kcmqzinekvikpmlxkdxf`, organization: xohfhgerdtoqjiddlkbs)에는 이 앱의 `portfolio_data` 테이블 외에 `salary_data`(급여 계산 시스템으로 추정), `user_data` 테이블도 같이 있어요 — **다른 앱의 테이블이니 절대 건드리지 마세요**.

## 4. 데이터 모델 (Supabase `portfolio_data` 테이블, 1행짜리 JSON 저장)

| 컬럼 | 내용 |
|---|---|
| `transactions` | 한국+미국 매매내역 통합 배열. `{id, date, account, country, code, name, side, ccy, qty, price, source}` |
| `dividends_kr` | 한국 배당금. `{id, account, code, name, date, shares, rate}` |
| `dividends_us` | 미국 배당금. `{id, account, code, name, date, shares, rate, appliedRate}` |
| `dividend_status` | 배당현황(배당락일 기준). `{id, exDate, payDate, country, code, name, krwAmount, usdAmount}` |
| `current_prices` | 보유종목 현재가 수동/자동 입력값. key = `종목코드(또는 정규화된 이름)+"|"+통화` |
| `dividends_wife` | 와이프배당금(2026-09 추가, 미국배당금 탭 복제). `{id, account, code, name, date, shares, rate, appliedRate}`. **완전히 독립적인 기록** — 보유종목 KPI·배당현황 요약 등 다른 집계에는 전혀 반영되지 않아요. |

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
10. **와이프배당금 탭(2026-09 추가)**: 배당현황 탭 다음에 위치. 미국 배당금 탭을 그대로 복제한 구조(계좌/종목명/지급일/주수/배당기준액$/적용환율, `dw-` 접두사 id, `divWife` 배열)지만, `computeHoldings()`·`renderKpis()`·배당 차트 등 어디에도 집계되지 않는 완전히 독립된 기록이에요. 종목명 자동완성(`us-name-datalist`)과 구글시트 이름 보정(`resolveStockByName`)은 미국배당금과 동일하게 공유해요.

## 6. 구현된 주요 기능 (전체 히스토리 요약)

- 탭: 보유종목 / 한국·미국 매매내역 / 한국·미국 배당금 / 환율정보 / 배당현황 / 와이프배당금
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

## 10. 영어 단어장 (`vocabulary.html`, 2026-09 추가)

포트폴리오 원장과는 기능상 완전히 별개인 **영어 단어 암기 앱**이에요. 같은 저장소에 두 번째 HTML 파일로 존재하고, 실제 서비스 주소는 https://myeonggyu77.github.io/portfolio-tracker/vocabulary.html 이에요.

- **백엔드**: 포트폴리오 원장과 **같은 Supabase 프로젝트**(`kcmqzinekvikpmlxkdxf`)를 그대로 써요. 로그인 계정도 동일. 데이터는 새로 만든 `vocabulary_data` 테이블(1행짜리 JSON 저장, `portfolio_data`와 동일한 패턴)에 들어가요.
  - 컬럼: `words` (jsonb 배열). 단어 1개당 `{id, word, pos, participle, example, meaning, memo, dateAdded, audioUrl, mastered, correctStreak, wrongCount, lastTestedDate}`.
  - `pos`(품사)·`example`(예문)는 사전 자동조회로 채워지고, 사용자가 직접 수정도 가능해요.
  - `participle`(분사, 2026-09 말 추가): 품사가 "동사"일 때 "현재분사 / 과거분사" 형태(예: "running / run")로 자동 채워짐. 자세한 내용은 아래 사전 자동조회 항목 참고.
  - **(2026-09 말 변경) 발음기호(`phonetic`) 필드는 제거됐어요.** 대신 그 자리에 예문(`example`)을 넣었어요. 기존에 저장돼 있던 `phonetic` 값은 그냥 무시돼요(마이그레이션 불필요).
  - `audioUrl`은 dictionaryapi.dev가 제공하는 실제 발음 녹음 파일 주소(없을 수 있음, 2026-09 추가). 저장은 되지만 표시 컬럼은 없고 발음 듣기 버튼에서만 쓰여요.
  - `mastered`는 수동 토글 또는 시험에서 `correctStreak`가 `MASTER_STREAK`(기본 3)에 도달하면 자동으로 `true`가 돼요.
  - `phrases` (jsonb 배열, 2026-09 말 추가, "생활영어" 탭용). 단어(`words`)와는 완전히 별개인 표현+번역 목록이에요. 항목당 `{id, phrase, translation, dateAdded, mastered, correctStreak, wrongCount, lastTestedDate}`. Supabase에 `alter table vocabulary_data add column phrases jsonb not null default '[]'::jsonb;`로 컬럼을 추가했어요.
- **생활영어 탭(2026-09 말 추가, 네 번째 탭)**: 단어장과는 별개로 생활 회화 표현(문장)과 그 번역을 등록·관리하는 탭이에요. 등록 폼은 "생활영어"(표현)·"번역" 두 칸만 있고, 사전 자동조회는 붙이지 않았어요(단어 등록 폼과 달리 순수 수동 입력). 목록 표 칼럼은 **생활영어 / 번역 / 등록일 / 연속정답 / 상태 / 수정·삭제** 6개예요. "상태" 배지(외움/학습중)는 단어장과 동일하게 클릭해서 수동으로 토글할 수 있고(토글 시 `correctStreak`를 `MASTER_STREAK`로 채우거나 0으로 초기화), "수정" 버튼은 단어장의 수정 기능과 같은 패턴(폼에 값 채우고 "수정 완료"/"취소"로 전환, `editingPhraseId`로 추적)이에요. **이 탭은 "오늘의 시험"/"주관식 문제" 퀴즈 엔진(`QUIZ_MODES`)과는 연결되어 있지 않아요** — 퀴즈로 자동으로 연속정답이 올라가지 않고, 상태 배지를 직접 눌러야만 바뀌어요. 나중에 퀴즈 기능을 붙이고 싶다면 이 점을 먼저 사용자에게 확인하세요.
- **오늘의 시험 로직**: `mastered=false`인 단어 전체가 그날의 출제 범위. 4지선다 객관식(단어 → 뜻 고르기). 오답은 같은 시험 세션 안에서 뒤로 재배치되어 다시 나오고, 정답을 맞히면 `correctStreak`가 올라가며 `MASTER_STREAK`회 연속 정답 시 자동으로 "외운 단어" 처리돼요. 오답 시 `correctStreak`는 0으로 초기화돼요.
- **주관식 문제(2026-09 말 추가, 세 번째 탭)**: "오늘의 시험" 탭 옆에 새로 추가된 탭. (처음엔 "주간 퀴즈"라는 이름으로 최근 7일 등록 단어 대상 객관식으로 만들었었는데, 사용자가 원한 건 "주간"이 아니라 "주관식"이었음을 확인하고 뜻→단어 직접 입력 방식으로 다시 구현함.) **등록된 단어 전체**(외운 단어 포함)가 출제 범위이고, 단어가 아니라 **뜻을 보여주고 사용자가 영어 단어를 직접 입력**해서 맞히는 주관식(단답형) 문제예요. 입력값은 앞뒤 공백 제거 + 대소문자 무시하고 정확히 일치해야 정답 처리돼요. "오늘의 시험"과 오답 재출제·다음 문제 진행 로직은 공용 엔진(`QUIZ_MODES`)을 같이 쓰지만(`interaction: 'typed'`로 구분), **`correctStreak`·`mastered` 등 학습 기록에는 전혀 반영되지 않는 독립된 철자 연습**이에요(정답/오답 집계는 그 퀴즈 세션 안에서만 보여주고 저장되지 않음).
- **사전 자동조회(품사·뜻·예문, 선택 기능, 2026-09 확장, 2026-09 말 대대적 개편)**: 단어 등록 폼에서 **단어 입력 후 다른 칸으로 포커스를 옮기면(blur) 자동으로** 품사·뜻·예문을 채워요. 언어 아이콘 버튼(`wf-dict-btn`)으로 언제든 수동 재조회도 가능해요.
  - **(2026-09 말) 발음기호 필드는 없앴고, 그 자리에 예문 필드를 넣었어요.** 예문은 dictionaryapi.dev의 정의(definition)에 달린 실제 예문 문장을 그대로 가져와요.
  - **품사가 자주 비어있던 버그 두 가지 수정(2026-09 말)**:
    1. dictionaryapi.dev가 돌려주는 영어 품사 문자열(`transitive verb`, `article`, `numeral` 등)이 서버의 `POS_MAP`에 정확히 일치하는 몇 종류(`noun`/`verb`/`adjective`...)하고만 매칭되던 게 원인이었어요. `mapPos()`가 문자열에 `"verb"`/`"noun"` 등이 **포함**되는지로 넓게 매칭하도록 고쳤고, `entry.meanings[0]`만 보던 것도 모든 entry·모든 meaning을 돌면서 값을 찾도록 바꿨어요.
    2. 그 다음엔 뜻 번역(`translate`)과 사전 조회(`fetchDictionaryInfo`)를 `Promise.all`로 "동시에" 호출하면 Supabase 서버에서 두 외부 호스트로 동시에 연결이 나갈 때 dictionaryapi.dev 쪽이 거의 매번 타임아웃까지 끌려가다 `AbortError`로 끊기는 문제를 타이밍 디버그 로그로 확인했어요(단순히 타임아웃을 늘리는 걸로는 해결 안 됨 — 늘린 값 그대로 다시 걸림). **그래서 두 호출을 `Promise.all`(병렬)이 아니라 순서대로(하나씩, 순차) 호출하도록 구조를 바꿨어요. 이 부분을 다시 병렬로 되돌리지 마세요 — 같은 버그가 재발해요.**
  - **클라이언트는 `dict-lookup` Edge Function 하나만 호출**해요. 그 안에서 서버가 뜻(번역) → 사전 조회(dictionaryapi.dev) → (예문이 있으면) 예문 번역을 순서대로 호출해서 합쳐 응답해요.
    - (히스토리) 한때 속도를 위해 dictionaryapi.dev를 **브라우저에서 직접** 호출하도록 분리했었는데, 모바일 인앱 브라우저 등 일부 클라이언트 환경에서 그 직접 호출이 막혀 품사·발음기호가 계속 비어있는 문제가 발생해서(2026-09 말) 다시 서버(Edge Function) 경유로 되돌렸어요. **다시 "클라이언트에서 두 소스를 직접 병렬 호출"하는 방식으로 바꾸지 마세요.**
  - **뜻(번역) 소스: Papago → MyMemory → 구글 번역 순서로 자동 전환**: `translate()`가 Secrets에 `NAVER_PAPAGO_CLIENT_ID`/`NAVER_PAPAGO_CLIENT_SECRET`이 등록돼 있으면 Papago를 쓰고, 없으면 MyMemory 번역 API(api.mymemory.translated.net, 무료·키 불필요)를 써요. MyMemory도 실패하면 마지막으로 구글 번역(비공식)을 시도해요. **현재(2026-09 말)는 사용자가 네이버 클라우드 플랫폼(NCP)에 새로 가입해서 Papago 키를 발급받아 Secrets에 등록했고, 정상적으로 Papago가 사용되고 있어요** (`meaningSource: "papago"`로 확인).
    - **주의**: 예전에 안내했던 개인 개발자용 Papago 번역 API(developers.naver.com, `openapi.naver.com/v1/papago/n2mt`)는 **서비스가 종료**됐어요. 지금 쓰는 건 **NCP(네이버 클라우드 플랫폼)의 신규 Papago Translation API**로, 주소(`papago.apigw.ntruss.com/nmt/v1/translation`)·인증 헤더(`X-NCP-APIGW-API-KEY-ID`/`X-NCP-APIGW-API-KEY`)·요청 형식(JSON 바디)이 예전과 달라요. `translateViaPapago()`가 이 새 방식으로 호출하도록 구현돼 있어요 — 다시 예전 openapi.naver.com 방식으로 되돌리지 마세요(서비스 종료돼서 작동 안 함).
    - Secrets 이름은 예전과 동일하게 `NAVER_PAPAGO_CLIENT_ID`/`NAVER_PAPAGO_CLIENT_SECRET`을 그대로 써요 — NCP 애플리케이션("mywords")에서 발급받은 Client ID/Client Secret이 등록돼 있어요.
    - **구글 번역 429 차단 발견(2026-09 말)**: 원래 Papago 없으면 바로 구글 번역(비공식)을 썼는데, 어느 시점부터 구글이 Supabase 서버 IP를 "429 Too Many Requests"로 차단하기 시작해서(전세계 Supabase 사용자가 같은 IP 대역을 공유해서 생긴 문제로 추정) 뜻 조회가 계속 실패하는 버그가 있었어요. 그래서 MyMemory를 중간 대체 소스로 추가했고, 구글은 최후 수단으로만 코드에 남아있어요.
  - **품사 대체(fallback) 소스: Datamuse API(2026-09 말 추가, api.datamuse.com, 가입·키 불필요)**: dictionaryapi.dev가 예고 없이 다운되는 일이 실제로 있었어요(직접 겪은 사례: Cloudflare 522 장애로 **하루 넘게** 응답 자체가 안 됨 — 우리 코드 문제 아니라 그 사이트 자체 장애였음, `dict-diag`로 직접 확인). dictionaryapi.dev에서 품사를 못 가져오면 `fetchPosViaDatamuse()`가 한 번 더 품사만 조회해요.
  - **예문 대체(fallback) 소스: Tatoeba(2026-09 말 추가, tatoeba.org, 가입·키 불필요)**: dictionaryapi.dev 장애가 하루 넘게 이어지는 걸 직접 겪고 나서 추가했어요. dictionaryapi.dev에서 예문을 못 가져오면 `fetchExampleViaTatoeba()`가 실제 사람들이 작성한 예문 문장 데이터베이스(Tatoeba)에서 그 단어가 쓰인 문장을 검색해 대신 써요(`https://tatoeba.org/eng/api_v0/search?from=eng&query=...`). 이 덕분에 dictionaryapi.dev가 죽어있어도 뜻·품사·예문 전부 계속 채워져요(테스트로 확인: elephant → "Elephants trumpet." 예문이 Tatoeba에서 정상적으로 채워짐). dictionaryapi.dev가 복구되면 다시 그쪽이 우선순위를 가져가요(항상 dictionaryapi.dev를 먼저 시도하고, 실패했을 때만 대체 소스로 넘어가는 구조).
  - **예문의 한국어 해설 → 메모 자동채움(2026-09 말 추가)**: dictionaryapi.dev에서 예문을 찾으면, 서버가 그 예문을 같은 번역 소스(Papago/MyMemory/구글)로 한 번 더 번역해서 `exampleKo` 필드로 돌려줘요. 클라이언트는 **메모 칸이 비어있을 때만** 이 값을 자동으로 채워요(사용자가 이미 메모를 적어뒀으면 덮어쓰지 않음).
  - **예문을 직접 입력/수정했을 때도 메모 자동 번역(2026-09 말 추가)**: 위 항목은 단어 조회로 자동 채워진 예문에만 적용됐는데, 사용자가 등록 폼의 예문 칸을 **직접 입력·수정**하고 다른 칸으로 포커스를 옮겨도(blur) 그 예문을 번역해서 메모에 채워줘요(메모가 비어있을 때만, 단어 조회 때와 동일한 규칙). `dict-lookup` Edge Function에 `word` 대신 `text` 쿼리 파라미터를 넘기면 사전 조회는 건너뛰고 `translate()`만 호출해서 순수 번역 결과만 돌려주는 모드를 추가했어요(`dict-lookup.ts` 버전 16). 클라이언트는 `translateExampleText()`/`autoTranslateExample()`가 이 모드를 호출하고, `wf-example` 필드에 별도 blur 리스너를 달았어요. 같은 예문을 반복 번역하지 않도록 `lastTranslatedExample`로 추적하고, 등록/수정 버튼도 이 번역이 끝날 때까지(최대 `DICT_FETCH_TIMEOUT_MS`) 기다려요(단어 조회 때와 같은 안전장치).
  - **클라이언트 타임아웃 15초(`DICT_FETCH_TIMEOUT_MS`, 2026-09 말 최종 조정)**: 뜻 번역 → 사전 조회 → 예문 번역이 순차로 이어지는 구조라 병렬일 때보다 느려요. 서버 쪽 외부 호출 타임아웃(`FETCH_TIMEOUT_MS`=8초, 예문 번역=5초)까지 감안해서 여유 있게 15초로 잡았어요. 이 타임아웃을 줄이면 응답이 오기 전에 등록 버튼이 조회를 포기해버릴 수 있으니 주의하세요.
  - Papago Secrets이 없던 시절 안내했던 "가입이나 API 키, Secrets 설정이 전혀 필요 없다"는 문구는 더 이상 최신 상태가 아니에요 — 지금은 Papago Secrets이 등록되어 있어요. 다만 Papago Secrets을 지워도 MyMemory로 자동 대체되어 앱은 계속 동작해요(가입 불필요 경로는 여전히 살아있음).
  - 옛 네이버 Papago 기반 `papago-lookup` Edge Function(별도 함수, 예전 openapi.naver.com 방식)은 더 이상 호출하지 않지만 Supabase에 남아있어요(삭제 API 없음) — 무시해도 돼요. Papago 지원은 이제 `dict-lookup` 안에 통합돼 있어요.
  - 비공식/무료 API(MyMemory, 구글, Datamuse, dictionaryapi.dev)는 정책 변경이나 장애로 예고 없이 막히거나 일부 필드만 채워질 수 있어요. 실패해도 전부 직접 입력 가능해요.
  - **등록 버튼과의 경쟁 상태 주의**: 자동조회가 끝나기 전에 "등록" 버튼을 누르면 검증에 실패해 오류가 뜰 수 있어서, 진행 중인 조회를 `lookupPromise`로 추적해 등록 버튼 클릭 시 그 조회가 끝날 때까지 기다리도록(`await`) 처리해뒀어요. 또한 자동조회로 뜻/품사가 채워질 때마다 남아있던 오류 메시지를 즉시 숨겨서, 필드가 채워졌는데 오류 문구만 남아있는 것처럼 보이는 문제도 막아뒀어요. 이 로직을 건드릴 땐 두 가지(대기, 오류 숨김) 모두 유지해야 해요.
  - **타임아웃 필수**: 처음엔 등록 버튼이 `lookupPromise`가 끝날 때까지 무조건 기다렸는데, 사전 조회 API가 응답을 안 주면 등록 버튼이 무한정 멈춰있는 문제가 있었어요(사용자가 영상으로 재현해서 알려줌). 그래서 ① 클라이언트(`fetchWithTimeout`)와 Edge Function 내부(`fetchWithTimeout`, 각 외부 호출마다) 양쪽에 `AbortController` 기반 타임아웃을 걸고, ② 등록 버튼도 `lookupPromise`를 최대 `DICT_FETCH_TIMEOUT_MS + 500ms`까지만 기다리도록(`Promise.race`) 이중 안전장치를 뒀어요. 사전 조회 관련 코드를 고칠 땐 이 타임아웃들을 절대 없애지 마세요 — 없으면 외부 API가 느리거나 응답이 없을 때 등록이 멈춰요.
  - **"예문 없는 단어 채우기" 버튼(2026-09 말 추가)**: dictionaryapi.dev 장애 중에 등록돼서 예문이 비어있는 단어들을, 사이트 복구 후 한 번에 다시 조회해서 채울 수 있는 일괄 재조회 버튼이에요(`fill-examples-btn`). 단어장 목록 위 툴바에 있고, 예문 없는 단어가 있을 때만 보이며 개수를 표시해요(`updateFillExamplesBtn()`). 클릭하면 예문이 비어있는 단어만 골라 `dict-lookup`을 순서대로(무료 API 과부하 방지로 단어 사이 300ms 간격) 재호출해서 예문과(메모가 비어있으면) 예문 해설을 채운 뒤 한 번에 저장해요.
  - **분사(현재분사/과거분사) 자동 계산(2026-09 말 추가)**: 품사가 "동사"일 때 "분사" 필드(`wf-participle`, 등록 폼에서 품사 바로 뒤)에 "running / run"처럼 현재분사·과거분사 형태를 자동으로 채워요. **외부 API를 전혀 호출하지 않고 클라이언트(`computeParticiple()`)에서 문법 규칙 + 내장 불규칙 동사표로 직접 계산**해요 — 이번 세션에서 외부 사전 API(dictionaryapi.dev)가 하루 넘게 다운되는 걸 겪은 뒤라, 분사는 아예 네트워크 의존성 없이 만든 거예요.
    - 규칙 동사는 철자 규칙으로 계산: 자음 중복(run→running), 묵음 e 제거(love→loving), y→ied(study→studied), ie→ying(die→dying) 등. `needsDoubling()`이 "자음+모음+자음으로 끝나고 w/x/y가 아님" 여부로 중복을 판단하는데, 완벽하지 않아요 — 강세가 첫 음절에 오는 다음절 동사(예: 원래 open→openning처럼 오판했던 사례)를 일부러 예외 처리했지만(`-en`으로 끝나는 4글자 이상 단어는 중복 안 함) 그 외의 비슷한 케이스는 여전히 틀릴 수 있어요. 사용자가 확인 후 직접 수정하면 돼요.
    - 불규칙 동사(be/been, go/gone, run/run 등 약 90개)는 `IRREGULAR_PAST_PARTICIPLES` 표에 있고, ing형 예외(be→being, see→seeing, agree→agreeing 등)는 `ING_EXCEPTIONS`에 있어요. 새 불규칙 동사를 추가하고 싶으면 이 표에 항목만 추가하면 돼요.
    - 품사가 사전 자동조회로 "동사"가 되면 자동 계산되고, 사용자가 품사 드롭다운을 수동으로 "동사"로 바꿔도(분사 칸이 비어있을 때만) 자동 계산돼요.
    - 데이터 모델에 `participle` 필드가 추가됐고, 목록 표에도 "분사" 칼럼이 추가됐어요.
- **발음 듣기(스피커 버튼, 2026-09 추가, 2026-09 말 위치 조정)**: **단어장 목록 표에만** 있어요(등록 폼에는 없음 — 등록 전 단어까지 들을 필요는 적다는 사용자 피드백으로 폼에서는 제거). `speak(word, audioUrl)` 함수가 ① `audioUrl`(dictionaryapi.dev의 실제 녹음)이 있으면 그걸 재생하고, ② 없거나 재생 실패하면 브라우저 내장 Web Speech API(`speechSynthesis`, 무료·키 불필요, 인터넷 연결 없이도 되는 브라우저도 있음)로 대체해요. iOS Safari 등 일부 브라우저는 첫 재생에 사용자 제스처가 필요할 수 있어요(버튼 클릭이라 문제 없음).
- **아이콘 폰트 의존 지양(2026-09 말 변경)**: tabler-icons 웹폰트가 사용자 환경에 따라 로드되지 않아 버튼이 빈 상자로 보이는 문제가 반복돼서, 단어장의 핵심 버튼(발음 듣기·삭제·사전 다시조회)은 아이콘 대신 **눈에 보이는 텍스트(또는 이모지)**로 표시해요 — 폰트 로드 여부와 무관하게 항상 보여요. 새 버튼을 추가할 때도 이 원칙을 따라주세요.
- 단어명 자동완성(`word-datalist`), 검색, 체크박스 다중선택+일괄삭제 등은 포트폴리오 원장과 같은 UI 패턴을 재사용했어요.
- **단어 목록 수정 기능(2026-09 말 추가)**: 목록 표의 각 행에 "수정" 버튼이 추가됐어요(삭제 버튼 왼쪽). 누르면 위쪽 "단어 등록" 폼에 그 단어의 값(단어/품사/분사/예문/뜻/메모)이 채워지고 폼이 "단어 수정" 모드로 바뀌어요(제목·등록 버튼 텍스트가 "수정 완료"로 바뀌고, "취소" 버튼이 나타남). `editingId`(전역 변수)로 어떤 단어를 수정 중인지 추적하고, 그 상태에서 "수정 완료"를 누르면 새로 추가하는 대신 해당 단어를 덮어써요(`mastered`/`correctStreak`/`wrongCount` 등 학습 기록 필드는 그대로 유지). "취소"를 누르거나 수정 중인 단어를 삭제하면 폼이 등록 모드로 초기화돼요.

## 11. 확인이 필요한 미해결 항목 (단어장)

- [x] ~~네이버 개발자센터 Papago 번역 API 키 발급~~ — 해당 개인 개발자용 API는 서비스 종료됨. **2026-09 말: 사용자가 NCP(네이버 클라우드 플랫폼)에 가입해서 신규 Papago Translation API 키를 발급받아 Secrets에 등록 완료.** 코드도 새 NCP 엔드포인트/인증 방식으로 맞춰 수정·배포함(`dict-lookup.ts` 버전 13). 현재 뜻 조회는 Papago로 정상 동작 중(`meaningSource: "papago"` 확인함). Papago는 순수 번역 API라 품사·예문은 제공하지 않음 — 그건 계속 dictionaryapi.dev(+Datamuse 대체)가 담당.
- [x] ~~국립국어원 KRDICT 오픈 API로 뜻 조회 대체~~ — 검토해봤지만 영어 단어로 검색해서 한국어 뜻을 역으로 찾는 기능 자체가 없음(한국어 표제어 → 외국어 뜻 방향만 지원). 이 용도에는 부적합, 채택 안 함(2026-09 말)
- Supabase에 테스트용으로만 배포하고 git에는 커밋하지 않은 임시 진단 Edge Function들이 남아있어요(삭제 API 없음, 무시해도 됨): `krdict-test`(KRDICT 검색 파라미터 테스트용), `dict-diag`(구글 번역 429 차단 여부 확인용). 둘 다 더 이상 앱에서 호출하지 않아요.

**PWA(홈 화면에 추가) 지원(2026-09 말 추가)**: 포트폴리오 원장과 같은 방식으로 단어장도 PWA를 지원해요. `vocabulary-manifest.json`·`vocabulary-sw.js`를 추가하고, `vocabulary.html` `<head>`에 manifest 링크·`theme-color`(`#0f6e56`, 단어장 accent 색과 동일)·`apple-touch-icon`을 추가했어요. 아이콘 4종은 포트폴리오 원장 것을 그대로 재사용(새로 안 만듦). 사용자는 폰 브라우저에서 "홈 화면에 추가"하면 앱 아이콘으로 설치되고 전체화면(주소창 없이)으로 실행돼요. 스토어에 올라가는 정식 네이티브 앱은 아니고, 그러려면 Capacitor로 감싸서 로컬 환경(맥+Xcode 또는 Android Studio)에서 빌드해야 해요(8번 항목 참고, 포트폴리오 원장과 동일 후보).

## 9. 작업 시 유의사항

- 이 프로젝트는 **빌드 도구가 없어요**. `portfolio-tracker.html`을 직접 수정하고 그대로 GitHub에 커밋하면 배포 끝(GitHub Pages가 자동 반영, 1~2분 소요).
- 새 기능 추가 시 데이터 구조가 바뀌면(`setup.sql`에 새 컬럼 필요) 사용자에게 Supabase SQL Editor에서 실행할 ALTER TABLE 구문을 안내해야 해요.
- 사용자는 코딩 경험이 없는 초보자예요. 설명은 쉽게, 단계별로, 스크린샷 요청에는 실제 화면과 최대한 비슷하게 안내해주세요.
- **Supabase MCP 도구는 이 저장소에서 자동 허용돼요(2026-09 설정)**: `.claude/settings.json`의 `permissions.allow`에 `mcp__Supabase__*`가 등록되어 있어서, `execute_sql`·`apply_migration`·`deploy_edge_function` 등 Supabase 관련 도구 호출은 매번 승인 프롬프트 없이 바로 실행돼요. 테이블 생성/변경, Edge Function 배포처럼 되돌리기 번거로운 작업도 포함되니 신중하게 사용하고, 실행 후에는 무엇을 했는지 사용자에게 알려주세요.
