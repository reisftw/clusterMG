const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function isTurnstileEnabled() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

function getTurnstileSiteKey() {
  return String(process.env.TURNSTILE_SITE_KEY || "").trim();
}

function getClientIp(req) {
  return String(req.headers?.["cf-connecting-ip"] || req.ip || "").trim();
}

function getAntiBotToken(req) {
  return String(
    req.body?.turnstileToken ||
      req.body?.captchaToken ||
      req.body?.["cf-turnstile-response"] ||
      req.get?.("x-turnstile-token") ||
      "",
  ).trim();
}

async function verifyTurnstileToken(token, req) {
  const secret = String(process.env.TURNSTILE_SECRET_KEY || "").trim();
  if (!secret) return { ok: true, skipped: true };
  if (!token) {
    return { ok: false, statusCode: 400, error: "Verificacao anti-bot obrigatoria." };
  }

  const body = new URLSearchParams({
    secret,
    response: token,
  });
  const remoteIp = getClientIp(req);
  if (remoteIp) body.set("remoteip", remoteIp);

  let response;
  try {
    response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    return { ok: false, statusCode: 503, error: "Nao foi possivel validar a protecao anti-bot." };
  }

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success !== true) {
    return { ok: false, statusCode: 400, error: "Verificacao anti-bot invalida." };
  }
  return { ok: true };
}

function requireAntiBot() {
  return async (req, res, next) => {
    if (!isTurnstileEnabled()) {
      next();
      return;
    }

    const result = await verifyTurnstileToken(getAntiBotToken(req), req);
    if (!result.ok) {
      res.status(result.statusCode || 400).json({ ok: false, error: result.error || "Verificacao anti-bot invalida." });
      return;
    }
    next();
  };
}

function getAntiBotConfig() {
  const siteKey = getTurnstileSiteKey();
  return {
    provider: "turnstile",
    enabled: isTurnstileEnabled() && Boolean(siteKey),
    siteKey,
  };
}

module.exports = {
  getAntiBotConfig,
  requireAntiBot,
  verifyTurnstileToken,
};
