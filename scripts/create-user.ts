import { supabase } from '../src/config/supabase.js';
import { hashPassword } from '../src/utils/password.js';

async function main(): Promise<void> {
  const [userName, email, password, roleCode, fullName] = process.argv.slice(2);

  if (!userName || !email || !password || !roleCode || !fullName) {
    console.error(
      'Uso: npx tsx scripts/create-user.ts <user_name> <email> <password> <ROLE_CODE> "<Nombre completo>"',
    );
    process.exit(1);
  }

  const { data: role, error: roleError } = await supabase
    .from('ROLES')
    .select('id, code')
    .eq('code', roleCode)
    .maybeSingle();

  if (roleError) throw roleError;
  if (!role) {
    console.error(`No existe el rol "${roleCode}". Revisa la tabla ROLES.`);
    process.exit(1);
  }

  const { data, error } = await supabase
    .from('USERS')
    .insert({
      role_id: role.id,
      full_name: fullName,
      user_name: userName,
      email,
      password_hash: await hashPassword(password),
      job_title: null,
      locked_until: null,
      last_login_at: null,
      must_change_password: false,
    })
    .select('id, user_name, email')
    .single();

  if (error) throw error;

  console.warn(`Usuario creado: #${data.id} ${data.user_name} <${data.email}> [${role.code}]`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
