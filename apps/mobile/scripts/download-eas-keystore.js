/**
 * Downloads the EAS Android upload keystore for local Gradle release builds.
 * Writes maja-upload.jks + keystore.properties under android/app/ (gitignored).
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

const PROJECT = "@anish2607s-team/maja";
const PACKAGE = "app.maja.mobile";
const OUT_DIR = path.join(__dirname, "..", "android", "app");

async function main() {
  const statePath = path.join(os.homedir(), ".expo", "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const sessionSecret = state.auth?.sessionSecret;
  if (!sessionSecret) {
    throw new Error("No Expo session in ~/.expo/state.json — run: npx eas login");
  }

  const query = `
    query($projectFullName: String!, $applicationIdentifier: String) {
      app {
        byFullName(fullName: $projectFullName) {
          id
          androidAppCredentials(
            filter: { applicationIdentifier: $applicationIdentifier, legacyOnly: false }
          ) {
            id
            applicationIdentifier
            androidAppBuildCredentialsList {
              id
              name
              isDefault
              androidKeystore {
                id
                type
                keystore
                keystorePassword
                keyAlias
                keyPassword
                sha1CertificateFingerprint
                sha256CertificateFingerprint
              }
            }
          }
        }
      }
    }
  `;

  const res = await fetch("https://api.expo.dev/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "expo-session": sessionSecret,
    },
    body: JSON.stringify({
      query,
      variables: { projectFullName: PROJECT, applicationIdentifier: PACKAGE },
    }),
  });

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(JSON.stringify(json.errors, null, 2));
  }

  const app = json.data?.app?.byFullName;
  const creds = app?.androidAppCredentials?.[0];
  const list = creds?.androidAppBuildCredentialsList ?? [];
  const buildCred = list.find((c) => c.isDefault) || list[0];
  const ks = buildCred?.androidKeystore;
  if (!ks?.keystore) {
    throw new Error(`No keystore found for ${PROJECT} / ${PACKAGE}`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const jksPath = path.join(OUT_DIR, "maja-upload.jks");
  const propsPath = path.join(OUT_DIR, "keystore.properties");

  fs.writeFileSync(jksPath, Buffer.from(ks.keystore, "base64"));
  fs.writeFileSync(
    propsPath,
    [
      "storeFile=maja-upload.jks",
      `storePassword=${ks.keystorePassword}`,
      `keyAlias=${ks.keyAlias}`,
      `keyPassword=${ks.keyPassword || ks.keystorePassword}`,
      "",
    ].join("\n"),
  );

  console.log(`Wrote ${jksPath} (${fs.statSync(jksPath).size} bytes)`);
  console.log(`Wrote ${propsPath}`);
  console.log(`credentials=${buildCred.name} default=${buildCred.isDefault}`);
  console.log(`alias=${ks.keyAlias}`);
  console.log(`sha1=${ks.sha1CertificateFingerprint}`);
  console.log(`sha256=${ks.sha256CertificateFingerprint}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
