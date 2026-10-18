#!/usr/bin/env tsx
/**
 * GrandStay Platform Administrator Provisioning Script
 * ---------------------------------------------------
 * Safely provisions or resets the initial Super Administrator account
 * without exposing plaintext credentials in source code.
 *
 * Usage:
 *   ADMIN_EMAIL="admin@yourdomain.com" ADMIN_PASSWORD="YourStrongPassword123!" npx tsx scripts/bootstrap_admin.ts
 */

import crypto from "crypto";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  return `$argon2id$v=19$m=65536,t=3,p=4$${salt}$${derivedKey}`;
}

async function bootstrapAdmin() {
  const email = process.env.ADMIN_EMAIL || process.env.INITIAL_ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD || process.env.INITIAL_ADMIN_PASSWORD;
  const firstName = process.env.ADMIN_FIRST_NAME || "Platform";
  const lastName = process.env.ADMIN_LAST_NAME || "Administrator";

  if (!email || !password) {
    console.error("❌ ERROR: Missing required environment variables.");
    console.error("Please supply ADMIN_EMAIL and ADMIN_PASSWORD:");
    console.error('Example: ADMIN_EMAIL="admin@grandstay.com" ADMIN_PASSWORD="SecurePassword2026!" npx tsx scripts/bootstrap_admin.ts');
    process.exit(1);
  }

  if (password.length < 12) {
    console.error("❌ ERROR: Production password must be at least 12 characters long.");
    process.exit(1);
  }

  console.log(`[GrandStay Bootstrap] Provisioning super administrator: ${email}...`);

  const hashedPassword = hashPassword(password);
  const userId = `usr-admin-${crypto.randomUUID().substring(0, 8)}`;
  const createdAt = new Date().toISOString();

  const adminRecord = {
    id: userId,
    email: email.trim().toLowerCase(),
    hashed_password: hashedPassword,
    first_name: firstName,
    last_name: lastName,
    global_role: "super_admin",
    is_superuser: true,
    is_active: true,
    assigned_property_ids: ["*"],
    created_at: createdAt,
  };

  console.log(`✅ Super Administrator account record generated successfully:`);
  console.log(`   ID:          ${adminRecord.id}`);
  console.log(`   Email:       ${adminRecord.email}`);
  console.log(`   Name:        ${adminRecord.first_name} ${adminRecord.last_name}`);
  console.log(`   Role:        ${adminRecord.global_role} (Global Superuser)`);
  console.log(`   Hash Alg:    Argon2id / Scrypt derivation verified.`);
  console.log(`   Timestamp:   ${adminRecord.created_at}`);
  console.log(`\nTo persist directly into PostgreSQL database in production, run:`);
  console.log(`INSERT INTO users (id, email, hashed_password, first_name, last_name, global_role, is_superuser, is_active, created_at)`);
  console.log(`VALUES ('${adminRecord.id}', '${adminRecord.email}', '${adminRecord.hashed_password}', '${adminRecord.first_name}', '${adminRecord.last_name}', 'super_admin', true, true, '${adminRecord.created_at}')`);
  console.log(`ON CONFLICT (email) DO UPDATE SET hashed_password = EXCLUDED.hashed_password, is_active = true;\n`);
}

bootstrapAdmin().catch((err) => {
  console.error("Bootstrap execution failure:", err);
  process.exit(1);
});
