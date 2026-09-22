// Supabase Edge Function: dict-lookup
// 단어장(vocabulary.html)의 단어 등록 폼이 호출하는 중계 서버예요.
// 단어 하나를 넘기면 구글 번역(비공식, 무료)으로 한국어 뜻을 가져와서 돌려줘요.
//
// 품사·발음기호·발음 오디오는 dictionaryapi.dev(CORS 허용)를 브라우저에서 직접 호출해요
// (2026-09 변경: 이전엔 이 함수 안에서 두 소스를 순차적으로 합쳐서 응답했는데, 느려서
// 클라이언트가 두 소스를 동시에 병렬 호출하도록 분리했어요. 체감 속도가 빨라져요).
//
// 배포: Supabase Edge Functions에 dict-lookup 이름으로 배포되어 있어요.
// 가입/API 키/Secrets 설정이 전혀 필요 없어요 — 배포만 되어 있으면 바로 동작해요.
//
// 주의: 비공식 API라서 구글 쪽 정책 변경으로 예고 없이 막히거나 응답이 없을 수 있어요.
// 실패해도 단어장 앱은 직접 입력으로 정상 동작해요 (이 함수는 선택 기능이에요).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  const url = new URL(req.url);
  const word = (url.searchParams.get("word") || "").trim();
  if (!word) return jsonResponse({ error: "missing_word" }, 400);

  try {
    const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q=${encodeURIComponent(word)}`;
    const res = await fetch(gUrl);
    if (!res.ok) {
      const detail = await res.text();
      return jsonResponse({ error: "translate_error", detail }, 502);
    }
    const data = await res.json();
    const segments = Array.isArray(data?.[0]) ? data[0] : [];
    const meaning = segments.map((seg: unknown) => (Array.isArray(seg) ? seg[0] : "") || "").join("").trim();
    if (!meaning) return jsonResponse({ error: "no_result" }, 502);
    return jsonResponse({ word, meaning });
  } catch (e) {
    return jsonResponse({ error: "fetch_failed", detail: String(e) }, 500);
  }
});
