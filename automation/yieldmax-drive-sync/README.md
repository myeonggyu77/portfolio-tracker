# YieldMax ULTY 일일 다운로드 → 구글 드라이브 자동화

매일 정해진 시간(한국시간 오전 8시)에 GitHub Actions가 자동으로
1. https://www.yieldmaxetfs.com/our-etfs/ulty/ 페이지에 접속해서
2. **Intra-Day Trades Download**, **Download Holdings** 두 파일을 내려받고
3. 파일 안의 `Date` 값을 읽어서 파일명을 `yy-mm-dd` 형식으로 바꾼 뒤
4. 지정한 구글 드라이브 폴더에 업로드해요. (같은 이름 파일이 있으면 덮어씀)

수동으로 지금 바로 한 번 실행해보고 싶으면: GitHub 저장소 → **Actions** 탭 →
"YieldMax ULTY 일일 다운로드 → 구글 드라이브" → **Run workflow** 버튼.

## 최초 1회 설정 (약 10분)

### 1단계. 구글 클라우드에서 "서비스 계정" 만들기

구글 드라이브에 파일을 자동으로 올리려면, 사람 대신 로그인해줄 "로봇 계정"이 필요해요. 이걸 서비스 계정이라고 불러요.

1. https://console.cloud.google.com/ 접속 (본인 구글 계정으로 로그인)
2. 화면 상단에서 새 프로젝트 만들기 (이름은 아무거나, 예: `yieldmax-sync`)
3. 왼쪽 메뉴 → **API 및 서비스** → **라이브러리** → `Google Drive API` 검색 → **사용 설정**
4. 왼쪽 메뉴 → **API 및 서비스** → **사용자 인증 정보** → **+ 사용자 인증 정보 만들기** → **서비스 계정**
5. 이름 아무거나 입력하고 계속 진행 → 완료
6. 방금 만든 서비스 계정 클릭 → **키** 탭 → **키 추가** → **새 키 만들기** → **JSON** 선택 → 생성
   → JSON 파일이 자동으로 컴퓨터에 다운로드돼요. **이 파일을 잘 보관하세요** (비밀번호나 마찬가지예요).
7. 서비스 계정 상세 화면에 나오는 이메일 주소를 복사해두세요.
   `xxxxx@yyyyy.iam.gserviceaccount.com` 형태예요.

### 2단계. 구글 드라이브 폴더를 서비스 계정과 공유하기

1. 구글 드라이브에서 파일을 저장할 폴더를 만들거나 정하세요 (예: "YieldMax 자동다운로드")
2. 그 폴더 우클릭 → **공유** → 1단계에서 복사한 서비스 계정 이메일을 추가 →
   권한은 **편집자(Editor)**로 설정 → 공유
3. 그 폴더를 열었을 때 브라우저 주소창에 보이는 긴 폴더 ID를 복사해두세요.
   `https://drive.google.com/drive/folders/여기가_폴더_ID`

### 3단계. GitHub 저장소에 비밀값(Secrets) 등록하기

1. GitHub에서 `myeonggyu77/portfolio-tracker` 저장소 → **Settings** →
   왼쪽 메뉴 **Secrets and variables** → **Actions**
2. **New repository secret** 클릭해서 아래 2개를 각각 등록:

   - 이름: `GDRIVE_FOLDER_ID`
     값: 2단계에서 복사한 폴더 ID

   - 이름: `GOOGLE_SERVICE_ACCOUNT_KEY_BASE64`
     값: 1단계에서 받은 JSON 파일 전체 내용을 base64로 인코딩한 값

     터미널(맥) 또는 WSL/Git Bash(윈도우)가 있다면:
     ```
     base64 -i 다운로드한파일.json | tr -d '\n'
     ```
     이 명령이 출력하는 긴 문자열을 통째로 복사해서 값으로 붙여넣으세요.
     (터미널이 없다면 아무 온라인 "base64 encode" 도구에 JSON 파일 내용을 붙여넣어도 돼요.
     단, 서비스 계정 키는 민감정보이니 신뢰할 수 있는 도구만 사용하세요.)

### 4단계. 확인

Secrets 2개를 등록했으면 끝이에요. 다음 날 오전 8시(KST)에 자동으로 실행되고,
지금 바로 테스트하고 싶으면 위에서 설명한 **Run workflow** 버튼으로 수동 실행해보세요.
Actions 탭에서 실행 로그를 보면 성공/실패와 이유를 확인할 수 있어요.

## 참고 / 나중에 손볼 수 있는 부분

- 실행 시간을 바꾸려면 `.github/workflows/yieldmax-daily-download.yml`의
  `cron: '0 23 * * *'` 부분을 수정하세요 (UTC 기준).
- 사이트의 다운로드 버튼 문구나 구조가 바뀌면 `download-and-upload.js`의
  `TARGETS` 배열(버튼 텍스트)을 수정해야 할 수 있어요.
- 파일명 접두사(`ULTY_Holdings`, `ULTY_IntradayTrades`)도 같은 파일에서 바꿀 수 있어요.
