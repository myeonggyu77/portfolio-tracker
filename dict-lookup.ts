// Supabase Edge Function: dict-lookup
// 단어장(vocabulary.html)의 단어 등록 폼이 호출하는 중계 서버예요.
// 단어 하나를 넘기면 (1) 한국어 뜻을, (2) 무료 영어사전 API(dictionaryapi.dev)로
// 발음기호·품사·발음 오디오 URL을 가져와서 합쳐서 돌려줘요.
//
// 배포: Supabase Edge Functions에 dict-lookup 이름으로 배포되어 있어요.
//
// 뜻(번역) 소스 — 2026-09 말: 네이버 Papago 번역 API로 전환.
//   - Secrets에 NAVER_PAPAGO_CLIENT_ID / NAVER_PAPAGO_CLIENT_SECRET 이 등록되어 있으면
//     Papago(openapi.naver.com)를 사용해요.
//   - 아직 등록 안 됐으면(비어있으면) 자동으로 구글 번역(비공식, 무료, 키 불필요)으로
//     대체해서 계속 동작해요 — 키 등록 전에도 앱이 멈추지 않아요.
//   - 키를 Secrets에 등록하는 순간, 재배포 없이 바로 Papago로 전환돼요.
//
// 품사·발음기호·발음 오디오는 항상 dictionaryapi.dev(무료, 키 불필요)에서 가져와요.
//
// 두 소스 모두 Promise.all로 서버에서 동시에 호출해서 합쳐 응답해요. 클라이언트는
// 이 함수 하나만 호출하면 돼요(모바일 인앱 브라우저 등에서 dictionaryapi.dev 직접 호출이
// 막히는 문제가 있어서, 서버 경유로 고정했어요 — 이 구조를 다시 클라이언트 직접 호출로
// 바꾸지 마세요).
//
// 각 외부 호출에는 4초 타임아웃을 둬서, 한쪽이 느려도 전체 응답이 무한정 늦어지지 않아요.
// 실패해도 단어장 앱은 직접 입력으로 정상 동작해요 (이 함수는 선택 기능이에요).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const NAVER_CLIENT_ID = Deno.env.get("NAVER_PAPAGO_CLIENT_ID");
const NAVER_CLIENT_SECRET = Deno.env.get("NAVER_PAPAGO_CLIENT_SECRET");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const POS_MAP: Record<string, string> = {
  noun: "명사",
  verb: "동사",
  adjective: "형용사",
  adverb: "부사",
  pronoun: "대명사",
  preposition: "전치사",
  conjunction: "접속사",
  interjection: "감탄사",
  exclamation: "감탄사",
};

const FETCH_TIMEOUT_MS = 4000;

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

async function fetchMeaningViaPapago(word: string): Promise<string> {
  try {
    const res = await fetchWithTimeout("https://openapi.naver.com/v1/papago/n2mt", {
      method: "POST",
      headers: {
        "X-Naver-Client-Id": NAVER_CLIENT_ID!,
        "X-Naver-Client-Secret": NAVER_CLIENT_SECRET!,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: new URLSearchParams({ source: "en", target: "ko", text: word }),
    });
    if (!res.ok) return "";
    const data = await res.json();
    return data?.message?.result?.translatedText || "";
  } catch {
    return "";
  }
}

async function fetchMeaningViaGoogle(word: string): Promise<string> {
  try {
    const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q=${encodeURIComponent(word)}`;
    const res = await fetchWithTimeout(gUrl);
    if (!res.ok) return "";
    const data = await res.json();
    const segments = Array.isArray(data?.[0]) ? data[0] : [];
    return segments.map((seg: unknown) => (Array.isArray(seg) ? seg[0] : "") || "").join("").trim();
  } catch {
    return "";
  }
}

async function fetchMeaning(word: string): Promise<string> {
  if (NAVER_CLIENT_ID && NAVER_CLIENT_SECRET) {
    const viaPapago = await fetchMeaningViaPapago(word);
    if (viaPapago) return viaPapago;
    // Papago가 키 오류 등으로 실패하면 구글 번역으로 조용히 대체해요.
  }
  return fetchMeaningViaGoogle(word);
}

async function fetchDictionaryInfo(word: string): Promise<{ phonetic: string; pos: string; audio: string }> {
  try {
    const res = await fetchWithTimeout(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!res.ok) return { phonetic: "", pos: "", audio: "" };
    const data = await res.json();
    const entry = Array.isArray(data) ? data[0] : null;
    if (!entry) return { phonetic: "", pos: "", audio: "" };

    let phonetic = entry.phonetic || "";
    let audio = "";
    if (Array.isArray(entry.phonetics)) {
      for (const p of entry.phonetics) {
        if (!phonetic && p.text) phonetic = p.text;
        if (!audio && p.audio) audio = p.audio;
      }
    }
    if (audio && audio.startsWith("//")) audio = "https:" + audio;

    let pos = "";
    if (Array.isArray(entry.meanings) && entry.meanings[0]?.partOfSpeech) {
      pos = POS_MAP[entry.meanings[0].partOfSpeech] || "";
    }
    return { phonetic, pos, audio };
  } catch {
    return { phonetic: "", pos: "", audio: "" };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  const url = new URL(req.url);
  const word = (url.searchParams.get("word") || "").trim();
  if (!word) return jsonResponse({ error: "missing_word" }, 400);

  const [meaning, dict] = await Promise.all([fetchMeaning(word), fetchDictionaryInfo(word)]);

  if (!meaning && !dict.phonetic && !dict.pos) {
    return jsonResponse({ error: "no_result" }, 502);
  }

  return jsonResponse({
    word,
    meaning,
    phonetic: dict.phonetic,
    pos: dict.pos,
    audio: dict.audio,
    meaningSource: NAVER_CLIENT_ID && NAVER_CLIENT_SECRET ? "papago" : "google",
  });
});
