// api/seg_reaction_save.js
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getBearer(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const token = getBearer(req);
  if (!token) return res.status(200).json({ ok: false, reason: "not_logged_in" });

  const { clip_id, seg_index, reaction } = req.body || {};
  if (clip_id === undefined || seg_index === undefined || !reaction) {
    return res.status(400).json({ error: "missing_fields" });
  }
  if (!["good", "hard", "lost"].includes(reaction)) {
    return res.status(400).json({ error: "invalid_reaction" });
  }

  try {
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data } = await anon.auth.getUser(token);
    const user = data?.user || null;
    if (!user) return res.status(200).json({ ok: false, reason: "invalid_token" });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { error } = await admin.from("seg_reactions").upsert(
      { user_id: user.id, clip_id: Number(clip_id), seg_index: Number(seg_index), reaction },
      { onConflict: "user_id,clip_id,seg_index" }
    );

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
};
