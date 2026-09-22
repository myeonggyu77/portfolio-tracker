// Supabase Edge Function: papago-lookup
// 단어장(vocabulary.html)의 "파파고로 뜻 자동조회" 버튼이 호출하는 중계 서버예요.
// 네이버 개발자센터(Papago 번역 API) 키를 브라우저에 노출하지 않기 위해 이 함수를 통해서만 호출해요.
//
// 배포: Supabase Edge Functions에 papago-lookup 이름으로 배포되어 있어요.
// 필요 설정: Supabase 프로젝트 Edge Functions → Secrets에 아래 두 값을 등록해야 실제로 동작해요.
//   NAVER_PAPAGO_CLIENT_ID
//   NAVER_PAPAGO_CLIENT_SECRET
// (developers.naver.com 에서 애플리케이션 등록 → Papago 번역 API 사용 설정 → Client ID/Secret 발급)
// 등록 전까지는 앱이 "아직 설정되지 않았어요" 메시지만 보여주고, 뜻 직접 입력은 그대로 가능해요.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const NAVER_CLIENT_ID = Deno.env.get("NAVER_PAPAGO_CLIENT_ID");
const NAVER_CLIENT_SECRET = Deno.env.get("NAVER_PAPAGO_CLIENT_SECRET");

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

  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
    return jsonResponse({ error: "papago_not_configured" }, 503);
  }

  const url = new URL(req.url);
  const word = (url.searchParams.get("word") || "").trim();
  if (!word) return jsonResponse({ error: "missing_word" }, 400);

  try {
    const res = await fetch("https://openapi.naver.com/v1/papago/n2mt", {
      method: "POST",
      headers: {
        "X-Naver-Client-Id": NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: new URLSearchParams({ source: "en", target: "ko", text: word }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return jsonResponse({ error: "papago_error", detail }, 502);
    }

    const data = await res.json();
    const meaning = data?.message?.result?.translatedText || "";
    return jsonResponse({ word, meaning });
  } catch (e) {
    return jsonResponse({ error: "fetch_failed", detail: String(e) }, 500);
  }
});
