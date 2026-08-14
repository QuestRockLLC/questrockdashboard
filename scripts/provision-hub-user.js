/**
 * Create or reset a single Intelligence Hub / core Supabase user.
 *
 * Run:
 *   node scripts/provision-hub-user.js "Password!" email@questrock.com "Full Name" role
 *
 * Example:
 *   node scripts/provision-hub-user.js "WelcomeToQuestRock1!" krockey@questrock.com "Kerry Rockey" processor
 */

const path = require("path");
const fs = require("fs");

const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  content.split("\n").forEach((line) => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, "");
      process.env[key] = value;
    }
  });
}

const password = process.argv[2];
const email = (process.argv[3] || "").trim().toLowerCase();
const fullName = process.argv[4] || "";
const role = process.argv[5] || "processor";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

if (!password || !email || !fullName) {
  console.error(
    'Usage: node scripts/provision-hub-user.js "Password!" email@questrock.com "Full Name" [role]'
  );
  process.exit(1);
}

const { createClient } = require("@supabase/supabase-js");
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserByEmail(targetEmail) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find(
      (user) => (user.email || "").toLowerCase() === targetEmail.toLowerCase()
    );
    if (found) return found;
    if (data.users.length < 200) break;
  }
  return null;
}

async function ensureAuthUser() {
  const existing = await findUserByEmail(email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw error;
    return { action: "password_updated", id: existing.id };
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createErr) throw createErr;
  return { action: "created", id: created.user.id };
}

async function ensurePublicUser(authUserId) {
  const { data: byId, error: byIdErr } = await admin
    .from("users")
    .select("id,email,full_name,role,is_active")
    .eq("id", authUserId)
    .maybeSingle();
  if (byIdErr) throw byIdErr;

  if (byId) {
    const { error } = await admin
      .from("users")
      .update({ email, full_name: fullName, role, is_active: true })
      .eq("id", authUserId);
    if (error) throw error;
    return { action: "profile_updated_by_id" };
  }

  const { data: byEmail, error: byEmailErr } = await admin
    .from("users")
    .select("id,email,full_name,role,is_active")
    .eq("email", email)
    .maybeSingle();
  if (byEmailErr) throw byEmailErr;

  if (byEmail) {
    const { error } = await admin
      .from("users")
      .update({ id: authUserId, full_name: fullName, role, is_active: true })
      .eq("email", email);
    if (error) throw error;
    return { action: "profile_linked_to_auth_id" };
  }

  const { error } = await admin.from("users").insert({
    id: authUserId,
    email,
    full_name: fullName,
    role,
    is_active: true,
  });
  if (error) throw error;
  return { action: "profile_created" };
}

async function main() {
  console.log("Core Supabase:", url);
  const auth = await ensureAuthUser();
  const profile = await ensurePublicUser(auth.id);
  console.log(`${email}: auth ${auth.action}, ${profile.action}, role ${role}`);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
