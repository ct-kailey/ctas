import { defineRailway, preserve, project, service } from "railway/iac";

// This partial owns the application service only. Postgres and its volume remain
// outside this file. Never remove this export to perform a whole-project apply.
export const partial = "ains-workspace";

export default defineRailway((ctx) => {
  if (ctx.projectId !== "5613832c-17b3-4ef8-b40e-f032b6d1bbde" ||
      ctx.environmentId !== "bc443862-e45f-4dd4-abeb-80dc45462bf2") {
    throw new Error("This configuration targets the AINS production environment only.");
  }

  const application = service("ains-workspace", {
    // Keep CLI-uploaded source and the existing generated domain on Railway.
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile", buildEnvironment: "V3" },
    // Regional placement is the persisted replica setting. Avoid also setting
    // legacy deploy.numReplicas, which the environment normalizes away.
    replicas: { "asia-southeast1-eqsg3a": 1 },
    deploy: {
      healthcheckPath: "/healthz",
      healthcheckTimeout: 120,
      // ON_FAILURE is Railway's default and is omitted from imported state.
      // The deployment manifest confirms ON_FAILURE with this explicit limit.
      restartPolicyMaxRetries: 5,
      drainingSeconds: 300,
      runtime: "V2",
      ipv6EgressEnabled: false,
      useLegacyStacker: false,
    },
    env: {
      APP_ORIGIN: preserve(),
      BOOTSTRAP_ADMIN_EMAIL: preserve(),
      BOOTSTRAP_ADMIN_NAME: preserve(),
      BOOTSTRAP_ADMIN_PASSWORD: preserve(),
      DATABASE_URL: preserve(),
      GOOGLE_CLIENT_ID: preserve(),
      GOOGLE_CLIENT_SECRET: preserve(),
      NODE_ENV: preserve(),
      NORA_FLOW_TOKEN: preserve(),
      NORA_PIPELINE_TOKEN: preserve(),
      NORA_REGISTRATION_TOKEN: preserve(),
      NORA_CHANNEL_TRIAGE_TOKEN: preserve(),
      NORA_IMPLEMENTATION_TOKEN: preserve(),
      NORA_COMMERCIAL_TOKEN: preserve(),
      PORT: preserve(),
      PYTHON_BIN: preserve(),
      RAILWAY_DEPLOYMENT_DRAINING_SECONDS: preserve(),
    },
  });

  return project("AINS", { resources: [application] });
});
