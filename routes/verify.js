const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, VERIFICATION_SID } = process.env;
const { ensureLoggedIn } = require("connect-ensure-login");
const express = require("express");
const twilio = require("twilio")(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const logger = require("../logger")();
const { createAccessToken } = require("../helpers/createAccessToken");
const { performSimCheck } = require("../helpers/performSimCheck");
const router = express.Router();

router.get("/", ensureLoggedIn(), async (req, res) => {
  if (req.user.role !== "access secret content") {
    const errors = { wasValidated: false };
    const channel = req.user.verificationMethod;
    let verificationRequest;

    try {
      //create tru.ID access token
      const accessToken = await createAccessToken();
      console.log(accessToken);
      // perform SIMCheck
      const no_sim_change = await performSimCheck(req.user.phoneNumber.split("+")[1], accessToken);
      console.log(no_sim_change);
      // If the SIM has changed we inform the client
      if (!no_sim_change) {
        return res.render("sim-changed", { error: "Cannot proceed. SIM changed too recently ❌" });
      }
      verificationRequest = await twilio.verify
        .services(VERIFICATION_SID)
        .verifications.create({ to: req.user.phoneNumber, channel });
    } catch (e) {
      logger.error(e);
      return res.status(500).send(e);
    }

    logger.debug(verificationRequest);

    return res.render("verify", { title: "Verify", user: req.user, errors });
  }

  throw new Error("User already has `access secret content` role.");
});

router.post("/", ensureLoggedIn(), async (req, res) => {
  const { verificationCode: code } = req.body;
  console.log(code);
  console.log(req.user.phoneNumber);
  let verificationResult;
  const errors = { wasValidated: true };

  try {
    verificationResult = await twilio.verify
      .services(VERIFICATION_SID)
      .verificationChecks.create({ code, to: req.user.phoneNumber });
  } catch (e) {
    logger.error(e);
    return res.status(500).send(e);
  }

  logger.debug(verificationResult);

  if (verificationResult.status === "approved") {
    req.user.role = "access secret content";
    await req.user.save();
    return res.redirect("/");
  }

  errors.verificationCode = `Unable to verify code. status: ${verificationResult.status}`;
  return res.render("verify", { title: "Verify", user: req.user, errors });
});

module.exports = router;
