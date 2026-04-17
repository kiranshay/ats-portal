// Runtime configuration for psm-generator Cloud Functions.
//
// Secret-valued params (set via `firebase functions:secrets:set`):
//   WISE_API_KEY, WISE_USER_ID, WISE_INSTITUTE_ID, WISE_NAMESPACE
//
// Non-secret params (set via `firebase deploy` prompts or .env):
//   WISE_WRITE_ENABLED        — boolean. Default false. First deploy is read-only.
//   APP_BASE_URL              — public hosting URL used inside Wise message bodies.
//                               Parameterized so the portal.affordabletutoringsolutions.org
//                               rename (see PHASE_3_SESSION_10.md §Follow-ups #4) is a
//                               config change, not a code edit.
//   DEV_TEST_RECIPIENT_EMAIL  — pinned test recipient for any Wise write experiments
//                               during Session 11's first week. Writes that target a
//                               non-test recipient are rejected while WISE_WRITE_ENABLED
//                               is false. See kickoff "test recipient pinned" constraint.
//   DEV_TEST_CLASS_ID         — pinned test class for discussion posts when
//                               WISE_WRITE_ENABLED is false. Session 16 addition.

const { defineSecret, defineString, defineBoolean } = require("firebase-functions/params");

const WISE_API_KEY      = defineSecret("WISE_API_KEY");
const WISE_USER_ID      = defineSecret("WISE_USER_ID");
const WISE_INSTITUTE_ID = defineSecret("WISE_INSTITUTE_ID");
const WISE_NAMESPACE    = defineSecret("WISE_NAMESPACE");

const WISE_WRITE_ENABLED       = defineBoolean("WISE_WRITE_ENABLED", { default: false });
const APP_BASE_URL             = defineString("APP_BASE_URL", { default: "https://psm-generator.web.app" });
const DEV_TEST_RECIPIENT_EMAIL = defineString("DEV_TEST_RECIPIENT_EMAIL", { default: "" });
const DEV_TEST_CLASS_ID        = defineString("DEV_TEST_CLASS_ID", { default: "" });

const ALL_WISE_SECRETS = [WISE_API_KEY, WISE_USER_ID, WISE_INSTITUTE_ID, WISE_NAMESPACE];

function wiseConfig() {
  return {
    apiKey:      WISE_API_KEY.value(),
    userId:      WISE_USER_ID.value(),
    instituteId: WISE_INSTITUTE_ID.value(),
    namespace:   WISE_NAMESPACE.value(),
    host:        "https://api.wiseapp.live",
  };
}

module.exports = {
  ALL_WISE_SECRETS,
  WISE_WRITE_ENABLED,
  APP_BASE_URL,
  DEV_TEST_RECIPIENT_EMAIL,
  DEV_TEST_CLASS_ID,
  wiseConfig,
};
