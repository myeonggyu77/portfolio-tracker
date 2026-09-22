// Supabase Edge Function: dict-lookup
// 단어장(vocabulary.html)의 단어 등록 폼이 호출하는 중계 서버예요.
// 단어 하나를 넘기면 (1) 한국어 뜻을, (2) 무료 영어사전 API(dictionaryapi.dev)로
// 품사·예문·발음 오디오 URL을 가져와서 합쳐서 돌려줘요.
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
// 품사·예문·발음 오디오는 항상 dictionaryapi.dev(무료, 키 불필요)에서 가져와요.
// (발음기호는 2026-09 말 요청으로 더 이상 조회/표시하지 않아요. 그 대신 예문을 보여줘요.)
//
// 품사 매칭(2026-09 말 수정): dictionaryapi.dev가 돌려주는 partOfSpeech 값이
// "transitive verb", "article", "numeral" 처럼 미리 정해둔 몇 종류와 정확히 일치하지
// 않는 경우가 많아서, 매번 품사 칸이 비어있는 문제가 있었어요. 정확히 일치하는지 보는 대신
// 문자열에 "verb"/"noun" 등이 "포함"되는지로 넓게 매칭하고, 첫 번째 의미(entry.meanings[0])만
// 보지 않고 모든 entry·모든 meaning을 돌면서 값을 찾은 첫 품사/예문을 쓰도록 고쳤어요.
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
  const word = (url.searchParams.get("word") || "").trim();
  if (!word) return jsonResponse({ error: "missing_word" }, 400);

  const [meaning, dict] = await Promise.all([fetchMeaning(word), fetchDictionaryInfo(word)]);

  if (!meaning && !dict.pos && !dict.example) {
    return jsonResponse({ error: "no_result" }, 502);
  }

  return jsonResponse({
    word,
    meaning,
    pos: dict.pos,
    example: dict.example,
    audio: dict.audio,
    meaningSource: NAVER_CLIENT_ID && NAVER_CLIENT_SECRET ? "papago" : "google",
  });
});
