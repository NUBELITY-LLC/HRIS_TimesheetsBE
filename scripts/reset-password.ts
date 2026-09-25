import { supabase } from '../src/config/supabase.js';
import { hashPassword, passwordSchema } from '../src/utils/password.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const temporary = args.includes('--temporal');
  const [identifier, password] = args.filter((arg) => arg !== '--temporal');

  if (!identifier || !password) {
    console.error(
      'Uso: npx tsx scripts/reset-password.ts <user_name|email> <nueva_contrasena> [--temporal]',
    );
    process.exit(1);
  }

  const policy = passwordSchema().safeParse(password);
  if (!policy.success) {
    console.error(policy.error.issues.map((issue) => `- ${issue.message}`).join('\n'));
    process.exit(1);
  }

  const column = identifier.includes('@') ? 'email' : 'user_name';

  const { data: user, error: findError } = await supabase
    .from('USERS')
    .select('id, user_name, email, is_active')
    .eq(column, identifier.trim().toLowerCase())
    .maybeSingle();

  if (findError) throw findError;
  if (!user) {
    console.error(`No existe un usuario con ${column} "${identifier}".`);
    process.exit(1);
  }

  const { error } = await supabase
    .from('USERS')
    .update({
      password_hash: await hashPassword(password),
      must_change_password: temporary,
      failed_attempts: 0,
      locked_until: null,
    })
    .eq('id', user.id);

  if (error) throw error;

  console.warn(
    `Contrasena actualizada: #${user.id} ${user.user_name} <${user.email}>` +
      (temporary ? ' (debera cambiarla al entrar)' : '') +
      (user.is_active ? '' : ' — la cuenta sigue inactiva'),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
