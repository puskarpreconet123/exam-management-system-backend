const axios = require("axios");

const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

/**
 * Google reCAPTCHA v3 verification middleware factory.
 *
 *   router.post("/login", verifyCaptcha({ expectedAction: "login" }), login);
 *
 * Expects `captchaToken` (string) on `req.body`. Verifies it against
 * Google's siteverify endpoint and rejects with HTTP 400 on failure.
 *
 * @param {Object} [opts]
 * @param {number} [opts.minScore=0.5]      Score threshold in [0.0, 1.0]; lower = more bot-like.
 * @param {string} [opts.expectedAction]    If set, also asserts data.action === expectedAction
 *                                          (must match the action passed to grecaptcha.execute on the frontend).
 * @returns {import("express").RequestHandler}
 */
function verifyCaptcha(opts = {}) {
  const minScore = typeof opts.minScore === "number" ? opts.minScore : 0.5;
  const expectedAction = opts.expectedAction || null;

  return async (req, res, next) => {
    try {
      const captchaToken = req.body?.captchaToken;
      if (!captchaToken || typeof captchaToken !== "string") {
        return res.status(400).json({ message: "Captcha verification failed" });
      }

      const secret = process.env.RECAPTCHA_SECRET_KEY;
      if (!secret) {
        // Do not expose configuration details to the client.
        console.error("[verifyCaptcha] RECAPTCHA_SECRET_KEY is not configured");
        return res.status(500).json({ message: "Server misconfiguration" });
      }

      // Forward the client IP so Google can factor it into risk scoring.
      const remoteIp =
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;

      const params = new URLSearchParams();
      params.append("secret", secret);
      params.append("response", captchaToken);
      if (remoteIp) params.append("remoteip", remoteIp);

      const { data } = await axios.post(RECAPTCHA_VERIFY_URL, params.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 5000,
      });

      const passed =
        data?.success === true &&
        typeof data.score === "number" &&
        data.score >= minScore &&
        (!expectedAction || data.action === expectedAction);

      if (!passed) {
        // Log diagnostic info server-side; never echo it back.
        console.warn("[verifyCaptcha] Verification failed", {
          success: data?.success,
          score: data?.score,
          action: data?.action,
          errors: data?.["error-codes"],
        });
        return res.status(400).json({ message: "Captcha verification failed" });
      }

      // Surface metadata for downstream handlers (logging, adaptive auth).
      req.captcha = { score: data.score, action: data.action };
      next();
    } catch (err) {
      console.error("[verifyCaptcha] Error verifying token:", err.message);
      return res.status(400).json({ message: "Captcha verification failed" });
    }
  };
}

module.exports = verifyCaptcha;
