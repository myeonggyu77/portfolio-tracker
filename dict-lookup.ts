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
// 단어 뜻/사전 조회 두 가지는 병렬로 실행하고, 예문 번역은 예문을 알아야 시작할 수 있어서
// 그 다음에 순차로 실행돼요 — 그래서 클라이언트 타임아웃을 5초 → 9초로 늘렸어요.
//
// 각 외부 호출에는 4초(예문 번역은 3초) 타임아웃을 둬서, 한쪽이 느려도 전체 응답이 무한정
// 늦어지지 않아요. 실패해도 단어장 앱은 직접 입력으로 정상 동작해요 (이 함수는 선택 기능이에요).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const NAVER_CLIENT_ID = Deno.env.get("NAVER_PAPAGO_CLIENT_ID");
const NAVER_CLIENT_SECRET = Deno.env.get("NAVER_PAPAGO_CLIENT_SECRET");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const FETCH_TIMEOUT_MS = 4000;
const EXAMPLE_TRANSLATE_TIMEOUT_MS = 3000;

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
    const res = await fetchWithTimeout("https://openapi.naver.com/v1/papago/n2mt", {
      method: "POST",
      headers: {
        "X-Naver-Client-Id": NAVER_CLIENT_ID!,
        "X-Naver-Client-Secret": NAVER_CLIENT_SECRET!,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: new URLSearchParams({ source: "en", target: "ko", text }),
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

async function fetchDictionaryInfo(word: string): Promise<{ pos: string; example: string; audio: string; debug: string }> {
  try {
    const res = await fetchWithTimeout(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!res.ok) return { pos: "", example: "", audio: "", debug: `status=${res.status}` };
    const data = await res.json();
    if (!Array.isArray(data)) return { pos: "", example: "", audio: "", debug: `not_array:${JSON.stringify(data).slice(0, 200)}` };

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
    return { pos, example, audio, debug: "ok" };
  } catch (e) {
    return { pos: "", example: "", audio: "", debug: `exception:${String(e)}` };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  const url = new URL(req.url);
  const word = (url.searchParams.get("word") || "").trim();
  if (!word) return jsonResponse({ error: "missing_word" }, 400);

  const [meaning, dict] = await Promise.all([translate(word), fetchDictionaryInfo(word)]);

  // 예문을 찾았으면 그 예문도 한국어로 번역해서 메모 자동채움용으로 같이 보내요.
  // (예문이 있어야 번역할 수 있어서 위 두 조회가 끝난 뒤 순차로 실행돼요.)
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
    _debugDict: dict.debug, // 임시 디버그 필드 — 원인 파악 후 제거 예정
  });
});
