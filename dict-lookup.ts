// Supabase Edge Function: dict-lookup
// 단어장(vocabulary.html)의 단어 등록 폼이 호출하는 중계 서버예요.
// 단어 하나를 넘기면 (1) 한국어 뜻을, (2) 무료 영어사전 API(dictionaryapi.dev)로
// 품사·예문·발음 오디오 URL을 가져오고, (3) 예문이 있으면 그 예문의 한국어 번역(해설)까지
// 만들어서 합쳐 돌려줘요.
//
// 배포: Supabase Edge Functions에 dict-lookup 이름으로 배포되어 있어요.
//
// 번역 소스 우선순위 (2026-09 말 변경):
//   1) Secrets에 NAVER_PAPAGO_CLIENT_ID / NAVER_PAPAGO_CLIENT_SECRET 이 등록돼 있으면 Papago 사용.
//   2) 없으면(지금 상태) MyMemory 번역 API(api.mymemory.translated.net, 무료·키 불필요) 사용.
//   3) MyMemory도 실패하면 구글 번역(비공식)으로 마지막 시도.
//   (히스토리) 원래는 Papago 없으면 바로 구글 번역을 썼는데, 2026-09 말부터 구글이 Supabase
//   서버 IP를 "429 Too Many Requests"로 차단하기 시작해서(전세계 Supabase 사용자가 같은 IP
//   대역을 공유해서 생긴 문제로 추정) 뜻 조회가 계속 실패했어요. 진단 함수로 확인해보니
//   MyMemory는 정상 응답(200)해서 이걸 기본 소스로 바꿨어요. 구글은 혹시 몰라 최후 수단으로만 남겨둬요.
//   (2026-09 말 재추가) 사용자가 네이버 클라우드 플랫폼(NCP)에 가입해서 Papago Translation
//   API를 새로 발급받았어요. NCP의 신규 Papago API는 예전 개인 개발자용 API와 주소·인증
//   헤더가 달라요(papago.apigw.ntruss.com, X-NCP-APIGW-API-KEY-ID/X-NCP-APIGW-API-KEY
//   헤더, JSON 바디) — translateViaPapago()가 이 새 방식으로 호출해요. Secrets 이름
//   (NAVER_PAPAGO_CLIENT_ID/SECRET)은 그대로 유지하되 값은 NCP에서 발급받은 Client ID/
//   Client Secret을 넣어요.
//
// 품사·예문·발음 오디오는 항상 dictionaryapi.dev(무료, 키 불필요)에서 가져와요.
// (발음기호는 2026-09 말 요청으로 더 이상 조회/표시하지 않아요. 그 대신 예문을 보여줘요.)
//
// 품사 매칭(2026-09 말 수정): dictionaryapi.dev가 돌려주는 partOfSpeech 값이
// "transitive verb", "article", "numeral" 처럼 미리 정해둔 몇 종류와 정확히 일치하지
// 않는 경우가 많아서, 매번 품사 칸이 비어있는 문제가 있었어요. 정확히 일치하는지 보는 대신
// 문자열에 "verb"/"noun" 등이 "포함"되는지로 넓게 매칭하고, 첫 번째 의미(entry.meanings[0])만
// 보지 않고 모든 entry·모든 meaning을 돌면서 값을 찾은 첫 품사/예문을 쓰도록 고쳤어요.
//
// 예문 번역(memo 자동채움, 2026-09 말 추가): dictionaryapi.dev에서 예문을 찾으면, 그 예문을
// 같은 번역 소스로 한 번 더 번역해서 "exampleKo" 필드로 돌려줘요. 클라이언트는 이 값을
// 메모 칸이 비어있을 때만 자동으로 채워요(사용자가 직접 메모를 적어뒀으면 덮어쓰지 않아요).
//
// 품사·예문이 계속 비어있던 진짜 원인(2026-09 말): 뜻 번역(translate)과 사전 조회
// (fetchDictionaryInfo)를 Promise.all로 "동시에" 호출했더니, Supabase 서버에서 외부로
// 두 호스트에 동시에 연결이 나갈 때 dictionaryapi.dev 쪽이 거의 매번 타임아웃까지 끌려가다
// AbortError로 끊기는 걸 타이밍 디버그 로그로 확인했어요(단순히 타임아웃을 늘리는 걸로는
// 안 고쳐졌어요 — 늘린 값 그대로 다시 걸렸어요). 그래서 두 호출을 병렬이 아니라 순서대로
// (하나씩) 부르도록 구조를 바꿨어요. **이 부분을 다시 Promise.all(병렬)로 되돌리지 마세요**
// — 같은 버그가 재발해요. 세 번의 순차 호출(뜻 번역 → 사전 조회 → 예문 번역)이 이어져서
// 응답이 병렬일 때보다 조금 느려질 수 있어 클라이언트 타임아웃을 5초 → 15초로 늘렸어요.
//
// 각 외부 호출에는 8초(예문 번역은 5초) 타임아웃을 둬서, 한쪽이 느려도 전체 응답이 무한정
// 늦어지지 않아요. 실패해도 단어장 앱은 직접 입력으로 정상 동작해요 (이 함수는 선택 기능이에요).
//
// 품사 대체(fallback) 소스: Datamuse API(2026-09 말 추가, api.datamuse.com, 가입·키 불필요).
// dictionaryapi.dev가 예고 없이 다운되는 일이 있어서(직접 겪은 사례: Cloudflare 522 장애로
// 하루 넘게 응답 자체가 안 됨), dictionaryapi.dev에서 품사를 못 가져오면 Datamuse로 한 번
// 더 품사만 조회해요.
//
// 예문 대체(fallback) 소스: Tatoeba(2026-09 말 추가, tatoeba.org, 가입·키 불필요). dictionaryapi.dev
// 장애가 하루 넘게 이어지는 걸 직접 겪고 나서 추가했어요. 예문을 못 가져오면 Tatoeba의
// 예문 문장 데이터베이스에서 그 단어가 쓰인 문장을 검색해서 대신 써요.
// dictionaryapi.dev가 죽어도 최소한 품사·예문은 계속 채워지도록 하는 안전장치예요.
//
// 예문 직접 수정 시 번역(2026-09 말 추가): 등록 폼에서 예문 칸을 사용자가 직접 입력/수정했을
// 때도 메모에 한국어 해설을 자동으로 채워주려고, 단어 조회와 별개로 "text" 쿼리 파라미터만
// 넘기면 그 텍스트를 그냥 번역만 해서 돌려주는 모드를 추가했어요(사전 조회 없이 translate()만
// 호출). 클라이언트는 예문 칸에서 포커스를 옮길 때(blur) 이 모드로 호출해요.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const NAVER_CLIENT_ID = Deno.env.get("NAVER_PAPAGO_CLIENT_ID");
const NAVER_CLIENT_SECRET = Deno.env.get("NAVER_PAPAGO_CLIENT_SECRET");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const FETCH_TIMEOUT_MS = 8000;
const EXAMPLE_TRANSLATE_TIMEOUT_MS = 5000;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function translateViaPapago(text: string): Promise<string> {
  try {
    // 2026-09 말: 네이버 클라우드 플랫폼(NCP)의 신규 Papago Translation API로 전환.
    // (예전 개인 개발자용 openapi.naver.com/v1/papago/n2mt 엔드포인트는 서비스 종료됨.
    // 새 NCP API는 주소·인증 헤더·요청 형식이 다름 — 응답 형태는 예전과 동일해서
    // 아래 파싱 코드는 그대로 재사용 가능.)
    const res = await fetchWithTimeout("https://papago.apigw.ntruss.com/nmt/v1/translation", {
      method: "POST",
      headers: {
        "X-NCP-APIGW-API-KEY-ID": NAVER_CLIENT_ID!,
        "X-NCP-APIGW-API-KEY": NAVER_CLIENT_SECRET!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ source: "en", target: "ko", text }),
    });
    if (!res.ok) return "";
    const data = await res.json();
    return data?.message?.result?.translatedText || "";
  } catch {
    return "";
  }
}

async function translateViaMyMemory(text: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string> {
  try {
    const mUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ko`;
    const res = await fetchWithTimeout(mUrl, {}, timeoutMs);
    if (!res.ok) return "";
    const data = await res.json();
    const translated = data?.responseData?.translatedText || "";
    return decodeHtmlEntities(translated).trim();
  } catch {
    return "";
  }
}

async function translateViaGoogle(text: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string> {
  try {
    const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetchWithTimeout(gUrl, {}, timeoutMs);
    if (!res.ok) return "";
    const data = await res.json();
    const segments = Array.isArray(data?.[0]) ? data[0] : [];
    return segments.map((seg: unknown) => (Array.isArray(seg) ? seg[0] : "") || "").join("").trim();
  } catch {
    return "";
  }
}

// 공용 번역 함수 — 단어 뜻 조회와 예문 번역 둘 다 여기로 통해요.
async function translate(text: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string> {
  if (NAVER_CLIENT_ID && NAVER_CLIENT_SECRET) {
    const viaPapago = await translateViaPapago(text);
    if (viaPapago) return viaPapago;
    // Papago가 키 오류 등으로 실패하면 아래 소스로 조용히 대체해요.
  }
  const viaMyMemory = await translateViaMyMemory(text, timeoutMs);
  if (viaMyMemory) return viaMyMemory;
  return translateViaGoogle(text, timeoutMs);
}

// dictionaryapi.dev가 돌려주는 partOfSpeech 문자열(예: "noun", "transitive verb",
// "definite article")을 우리 select의 한국어 옵션 중 하나로 넓게 매칭해요.
function mapPos(raw: string): string {
  if (!raw) return "";
  const s = raw.toLowerCase();
  if (s.includes("noun")) return "명사";
  if (s.includes("verb")) return "동사";
  if (s.includes("adjective")) return "형용사";
  if (s.includes("adverb")) return "부사";
  if (s.includes("pronoun")) return "대명사";
  if (s.includes("preposition")) return "전치사";
  if (s.includes("conjunction")) return "접속사";
  if (s.includes("interjection") || s.includes("exclamation")) return "감탄사";
  return "기타";
}

// Datamuse가 돌려주는 품사 태그(n/v/adj/adv)를 한국어로 매핑해요.
function mapDatamuseTag(tag: string): string {
  switch (tag) {
    case "n": return "명사";
    case "v": return "동사";
    case "adj": return "형용사";
    case "adv": return "부사";
    default: return "";
  }
}

async function fetchPosViaDatamuse(word: string): Promise<string> {
  try {
    const dmUrl = `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=p&max=1`;
    const res = await fetchWithTimeout(dmUrl);
    if (!res.ok) return "";
    const data = await res.json();
    const tags: string[] = Array.isArray(data) && data[0] && Array.isArray(data[0].tags) ? data[0].tags : [];
    for (const t of tags) {
      const mapped = mapDatamuseTag(t);
      if (mapped) return mapped;
    }
    return "";
  } catch {
    return "";
  }
}

// 예문 대체(fallback) 소스: Tatoeba(2026-09 말 추가, tatoeba.org, 가입·키 불필요).
// dictionaryapi.dev가 하루 넘게 복구되지 않는 장애가 실제로 있었어요. Tatoeba는 실제
// 사람들이 작성한 예문 문장 데이터베이스라서 이 단어가 쓰인 문장을 검색해서 첫 번째
// 결과를 예문으로 써요.
async function fetchExampleViaTatoeba(word: string): Promise<string> {
  try {
    const tUrl = `https://tatoeba.org/eng/api_v0/search?from=eng&query=${encodeURIComponent(word)}&orphans=no&unapproved=no`;
    const res = await fetchWithTimeout(tUrl);
    if (!res.ok) return "";
    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    for (const r of results) {
      if (r && typeof r.text === "string" && r.text.trim()) return r.text.trim();
    }
    return "";
  } catch {
    return "";
  }
}

async function fetchDictionaryInfo(word: string): Promise<{ pos: string; example: string; audio: string }> {
  try {
    const res = await fetchWithTimeout(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!res.ok) return { pos: "", example: "", audio: "" };
    const data = await res.json();
    if (!Array.isArray(data)) return { pos: "", example: "", audio: "" };

    let pos = "";
    let example = "";
    let audio = "";

    for (const entry of data) {
      if (!audio && Array.isArray(entry.phonetics)) {
        for (const p of entry.phonetics) {
          if (!audio && p.audio) audio = p.audio;
        }
      }
      if (Array.isArray(entry.meanings)) {
        for (const m of entry.meanings) {
          if (!pos && m.partOfSpeech) pos = mapPos(m.partOfSpeech);
          if (!example && Array.isArray(m.definitions)) {
            for (const d of m.definitions) {
              if (!example && d.example) example = d.example;
            }
          }
          if (pos && example && audio) break;
        }
      }
      if (pos && example && audio) break;
    }

    if (audio && audio.startsWith("//")) audio = "https:" + audio;
    return { pos, example, audio };
  } catch {
    return { pos: "", example: "", audio: "" };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  const url = new URL(req.url);

  // "text"가 있으면 사전 조회 없이 그 텍스트만 순수 번역해서 돌려줘요(예문 직접 수정 시 사용).
  const text = (url.searchParams.get("text") || "").trim();
  if (text) {
    const translated = await translate(text, EXAMPLE_TRANSLATE_TIMEOUT_MS);
    if (!translated) return jsonResponse({ error: "no_result" }, 502);
    return jsonResponse({
      translated,
      meaningSource: NAVER_CLIENT_ID && NAVER_CLIENT_SECRET ? "papago" : "mymemory",
    });
  }

  const word = (url.searchParams.get("word") || "").trim();
  if (!word) return jsonResponse({ error: "missing_word" }, 400);

  // 뜻 번역과 사전 조회(dictionaryapi.dev)를 Promise.all로 "동시에" 부르면 Supabase
  // 서버에서 두 외부 호스트로 동시에 나가는 연결이 서로 지연시켜서 dictionaryapi.dev 쪽이
  // 거의 매번 타임아웃(8초)에 걸려 품사·예문이 비어버리는 문제가 있었어요(2026-09 말, 타이밍
  // 디버그 로그로 확인). 그래서 동시 호출을 버리고 하나씩 순서대로(순차) 호출하도록 고쳤어요.
  // 이 부분을 다시 Promise.all(병렬)로 되돌리지 마세요 — 같은 버그가 재발해요.
  const meaning = await translate(word);
  const dict = await fetchDictionaryInfo(word);

  // dictionaryapi.dev가 다운되는 등의 이유로 품사를 못 가져왔으면 Datamuse로 한 번 더 시도해요.
  if (!dict.pos) {
    dict.pos = await fetchPosViaDatamuse(word);
  }

  // 예문도 마찬가지로 못 가져왔으면 Tatoeba로 한 번 더 시도해요.
  if (!dict.example) {
    dict.example = await fetchExampleViaTatoeba(word);
  }

  // 예문을 찾았으면 그 예문도 한국어로 번역해서 메모 자동채움용으로 같이 보내요.
  const exampleKo = dict.example ? await translate(dict.example, EXAMPLE_TRANSLATE_TIMEOUT_MS) : "";

  if (!meaning && !dict.pos && !dict.example) {
    return jsonResponse({ error: "no_result" }, 502);
  }

  return jsonResponse({
    word,
    meaning,
    pos: dict.pos,
    example: dict.example,
    exampleKo,
    audio: dict.audio,
    meaningSource: NAVER_CLIENT_ID && NAVER_CLIENT_SECRET ? "papago" : "mymemory",
  });
});
