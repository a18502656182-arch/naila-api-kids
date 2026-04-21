// api/star_total.js
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 今日任务目标
const DAILY_GOALS = {
  watch_clip: 3,      // 看3个视频
  reading_score: 5,   // 跟读5句
  vocab_collect: 2,   // 收藏2个单词
};

function getBearer(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  const token = getBearer(req);
  if (!token) return res.status(200).json({ ok: false, reason: "not_logged_in" });

  try {
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data } = await anon.auth.getUser(token);
    const user = data?.user || null;
    if (!user) return res.status(200).json({ ok: false, reason: "invalid_token" });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // 总星星数
    const { data: totalData, error: totalErr } = await admin
      .from("star_logs")
      .select("stars")
      .eq("user_id", user.id);
    if (totalErr) return res.status(500).json({ error: totalErr.message });

    const total_stars = (totalData || []).reduce((sum, r) => sum + (r.stars || 0), 0);

    // 今日任务进度（按北京时间当天）
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    // 转成UTC
    const utcOffset = 8 * 60 * 60 * 1000;
    const todayStartUTC = new Date(todayStart.getTime() - utcOffset);

    const { data: todayData, error: todayErr } = await admin
      .from("star_logs")
      .select("action")
      .eq("user_id", user.id)
      .gte("created_at", todayStartUTC.toISOString());
    if (todayErr) return res.status(500).json({ error: todayErr.message });

    const today_counts = { watch_clip: 0, reading_score: 0, vocab_collect: 0 };
    (todayData || []).forEach(r => {
      if (today_counts[r.action] !== undefined) today_counts[r.action]++;
    });

    // 称号系统
    let title = null;
    if (total_stars >= 100) title = "英语小达人 🏆";
    else if (total_stars >= 50) title = "动画迷 🎬";
    else if (total_stars >= 10) title = "英语新星 ⭐";

    return res.status(200).json({
      ok: true,
      total_stars,
      title,
      today: {
        counts: today_counts,
        goals: DAILY_GOALS,
        completed: Object.keys(DAILY_GOALS).every(k => today_counts[k] >= DAILY_GOALS[k]),
      },
    });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
};
