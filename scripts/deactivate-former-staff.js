/**
 * Deactivate former staff — revoke Hub access and mark profiles inactive.
 *
 * Run:
 *   node scripts/deactivate-former-staff.js scurry@questrock.com jsherard@questrock.com
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY from QRdashboard .env.local (legacy core).
 * Also runs SQL deactivation on new core when NIKK_ALL_SESSION_POOLER_PASSWORD is set.
 */

const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  content.split("\n").forEach((line) => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim().replace(/ /g, "");
      const value = match[2].trim().replace(/^["']|["']$/g, "");
      process.env[key] = value;
    }
  });
}

const emails = process.argv.slice(2).map((e) => e.trim().toLowerCase()).filter(Boolean);
if (!emails.length) {
  console.error("Usage: node scripts/deactivate-former-staff.js email@questrock.com [...]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const { createClient } = require("@supabase/supabase-js");
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((user) => (user.email || "").toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 200) break;
  }
  return null;
}

async function deactivateOnCore(email) {
  const authUser = await findUserByEmail(email);
  if (!authUser) {
    console.log(`${email}: auth user not found on ${url}`);
    return;
  }

  const { error: banErr } = await admin.auth.admin.updateUserById(authUser.id, {
    ban_duration: "876000h",
  });
  if (banErr) throw banErr;

  const { error: profileErr } = await admin
    .from("users")
    .update({ is_active: false })
    .eq("id", authUser.id);
  if (profileErr && profileErr.code !== "PGRST116") throw profileErr;

  await admin.from("team_members").delete().eq("user_id", authUser.id);
  await admin.from("users").update({ primary_team_id: null }).eq("id", authUser.id);

  console.log(`${email}: banned + deactivated on legacy core (${authUser.id})`);
}

function deactivateOnNewCoreSql() {
  const pw = process.env.NIKK_ALL_SESSION_POOLER_PASSWORD;
  if (!pw) {
    console.log("Skipping new core SQL (NIKK_ALL_SESSION_POOLER_PASSWORD not set)");
    return;
  }

  const emailList = emails.map((e) => `'${e.replace(/'/g, "''")}'`).join(", ");
  const conn =
    "postgresql://postgres.anypkkcxqiwvwcvvebch@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require";

  execSync(
    `psql "${conn}" -v ON_ERROR_STOP=1 -c "UPDATE public.users SET is_active = false, updated_at = NOW() WHERE lower(email) IN (${emailList}); DELETE FROM public.team_members tm USING public.users u WHERE tm.user_id = u.id AND lower(u.email) IN (${emailList}); UPDATE public.users SET primary_team_id = NULL, updated_at = NOW() WHERE lower(email) IN (${emailList});"`,
    { stdio: "inherit", env: { ...process.env, PGPASSWORD: pw } }
  );
  console.log(`Deactivated on new core: ${emails.join(", ")}`);
}

async function deactivateOnSatelliteDb(label, connEnvKey, emailListSql) {
  const pw = process.env.NIKK_ALL_SESSION_POOLER_PASSWORD;
  if (!pw) return;

  const conns = {
    income: "postgresql://postgres.nycgnjbydxpwmgnwnwxg@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres?sslmode=require",
    credit: "postgresql://postgres.qfvdkhqeswxmmwsfgnzr@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres?sslmode=require",
  };
  const conn = conns[connEnvKey];
  if (!conn) return;

  try {
    execSync(
      `psql "${conn}" -v ON_ERROR_STOP=1 -c "UPDATE auth.users SET banned_until = NOW() + INTERVAL '100 years', updated_at = NOW() WHERE lower(email) IN (${emailListSql});"`,
      { stdio: "pipe", env: { ...process.env, PGPASSWORD: pw } }
    );
    console.log(`${label}: banned auth users`);
  } catch (err) {
    console.log(`${label}: skip (${err.message?.split("\n")[0] ?? "unavailable"})`);
  }
}

async function main() {
  for (const email of emails) {
    await deactivateOnCore(email);
  }

  const emailListSql = emails.map((e) => `'${e.replace(/'/g, "''")}'`).join(", ");
  deactivateOnNewCoreSql();
  await deactivateOnSatelliteDb("Income Bot", "income", emailListSql);
  await deactivateOnSatelliteDb("Credit Repair", "credit", emailListSql);

  console.log("Done.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
