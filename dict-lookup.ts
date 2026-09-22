// Supabase Edge Function: dict-lookup
// 단어장(vocabulary.html)의 단어 등록 폼이 호출하는 중계 서버예요.
// 단어 하나를 넘기면 (1) 구글 번역(비공식, 무료)으로 한국어 뜻을, (2) 무료 영어사전
// API(dictionaryapi.dev)로 발음기호·품사·발음 오디오 URL을 가져와서 합쳐서 돌려줘요.
//
// 배포: Supabase Edge Functions에 dict-lookup 이름으로 배포되어 있어요.
// 가입/API 키/Secrets 설정이 전혀 필요 없어요 — 배포만 되어 있으면 바로 동작해요.
//
// 주의: 둘 다 비공식이거나 무료 공개 API라서, 정책 변경으로 예고 없이 막히거나
// 응답이 없을 수 있어요. 실패해도 단어장 앱은 직접 입력으로 정상 동작해요
// (이 함수는 선택 기능이에요).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function fetchMeaning(word: string): Promise<string> {
  try {
    const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q=${encodeURIComponent(word)}`;
    const res = await fetch(gUrl);
    if (!res.ok) return "";
    const data = await res.json();
    const segments = Array.isArray(data?.[0]) ? data[0] : [];
    return segments.map((seg: unknown) => (Array.isArray(seg) ? seg[0] : "") || "").join("").trim();
  } catch {
    return "";
  }
}

async function fetchDictionaryInfo(word: string): Promise<{ phonetic: string; pos: string; audio: string }> {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
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

  return jsonResponse({ word, meaning, phonetic: dict.phonetic, pos: dict.pos, audio: dict.audio });
});
