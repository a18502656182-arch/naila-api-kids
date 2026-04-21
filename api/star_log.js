// api/star_log.js
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const VALID_ACTIONS = ["watch_clip", "reading_score", "vocab_collect"];
const STARS_MAP = {
  watch_clip: 1,
  reading_score: 1,
  vocab_collect: 1,
};

function getBearer(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const token = getBearer(req);
  if (!token) return res.status(200).json({ ok: false, reason: "not_logged_in" });

  const { action, clip_id } = req.body || {};
  if (!action || !VALID_ACTIONS.includes(action)) {
    return res.status(400).json({ error: "invalid_action" });
  }

  try {
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data } = await anon.auth.getUser(token);
    const user = data?.user || null;
    if (!user) return res.status(200).json({ ok: false, reason: "invalid_token" });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const stars = STARS_MAP[action] || 1;
    const { error } = await admin.from("star_logs").insert({
      user_id: user.id,
      action,
      stars,
      clip_id: clip_id ? Number(clip_id) : null,
    });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, stars_earned: stars });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
};
