// api/asr.js — 讯飞语音识别代理
const crypto = require("crypto");
const WebSocket = require("ws");

const APPID = process.env.XUNFEI_APPID || "775206ab";
const API_KEY = process.env.XUNFEI_API_KEY || "7ed702ba063393bed5eb9ed13ced5e45";
const API_SECRET = process.env.XUNFEI_API_SECRET || "ZTYyZjg4ZjU2YTVjMmQyZmVlZWVkOTMz";

function getAuthUrl() {
  const host = "iat-api.xfyun.cn";
  const path = "/v2/iat";
  const date = new Date().toUTCString();
  const signStr = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
  const sign = crypto.createHmac("sha256", API_SECRET).update(signStr).digest("base64");
  const authStr = `api_key="${API_KEY}", algorithm="hmac-sha256", headers="host date request-line", signature="${sign}"`;
  const auth = Buffer.from(authStr).toString("base64");
  return `wss://${host}${path}?authorization=${encodeURIComponent(auth)}&date=${encodeURIComponent(date)}&host=${host}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const { audio } = req.body || {};
  if (!audio) return res.status(400).json({ error: "missing_audio" });

  // audio 是 base64 编码的 PCM 或 wav 数据
  const audioBuffer = Buffer.from(audio, "base64");

  return new Promise((resolve) => {
    let result = "";
    let done = false;

    function finish(text, err) {
      if (done) return;
      done = true;
      if (err) {
        res.status(500).json({ error: err });
      } else {
        res.status(200).json({ ok: true, text });
      }
      resolve();
    }

    const timer = setTimeout(() => finish("", "timeout"), 15000);

    try {
      const url = getAuthUrl();
      const ws = new WebSocket(url);

      ws.on("open", () => {
        // 发第一帧：业务参数
        const frame1 = {
          common: { app_id: APPID },
          business: {
            language: "en_us",
            domain: "iat",
            accent: "mandarin",
            vad_eos: 3000,
            dwa: "wpgs",
          },
          data: {
            status: 0,
            format: "audio/L16;rate=16000",
            encoding: "raw",
            audio: audioBuffer.slice(0, 1280).toString("base64"),
          },
        };
        ws.send(JSON.stringify(frame1));

        // 分片发送剩余音频
        const chunkSize = 1280;
        let offset = 1280;
        const sendNext = () => {
          if (offset >= audioBuffer.length) {
            // 发结束帧
            ws.send(JSON.stringify({
              data: { status: 2, format: "audio/L16;rate=16000", encoding: "raw", audio: "" },
            }));
            return;
          }
          const chunk = audioBuffer.slice(offset, offset + chunkSize);
          offset += chunkSize;
          ws.send(JSON.stringify({
            data: { status: 1, format: "audio/L16;rate=16000", encoding: "raw", audio: chunk.toString("base64") },
          }));
          setTimeout(sendNext, 40);
        };
        setTimeout(sendNext, 40);
      });

      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          console.log("[asr] xunfei msg:", JSON.stringify(msg));
          if (msg.code !== 0) {
            ws.close();
            clearTimeout(timer);
            finish("", `xunfei_error_${msg.code}: ${msg.message}`);
            return;
          }
          const words = msg.data?.result?.ws || [];
          words.forEach(w => {
            w.cw?.forEach(c => { result += c.w || ""; });
          });
          if (msg.data?.status === 2) {
            ws.close();
            clearTimeout(timer);
            finish(result.trim());
          }
        } catch {}
      });

      ws.on("error", (e) => {
        clearTimeout(timer);
        finish("", String(e.message));
      });

      ws.on("close", () => {
        clearTimeout(timer);
        if (!done) finish(result.trim());
      });

    } catch (e) {
      clearTimeout(timer);
      finish("", String(e.message));
    }
  });
};
