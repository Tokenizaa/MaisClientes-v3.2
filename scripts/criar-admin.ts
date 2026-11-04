/**
 * Script: criar-admin.ts
 * ----------------------
 * Cadastra (ou atualiza) um usuário como admin geral no MapScrape v2.
 *
 * O que faz:
 * 1. Garante que o usuário exista no Supabase Auth (auth.users)
 * 2. Cria/atualiza o perfil na tabela `users` com role = 'admin'
 *
 * Uso:
 *   npx tsx scripts/criar-admin.ts
 *
 * Variáveis de ambiente necessárias:
 *   SUPABASE_URL             -> URL do projeto Supabase
 *   SUPABASE_SERVICE_ROLE_KEY -> Service role key (privilégios de admin)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Aceita email como primeiro argumento CLI, senão usa env, senão default
const ADMIN_EMAIL = process.argv[2] || process.env.ADMIN_EMAIL || 'olfnetto@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Netto@964212$';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Administrador Geral';

function buildAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim();
  const key = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL e SUPABASE_ANON_KEY devem estar definidos no ambiente.'
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

async function main() {
  const supabase = buildAdminClient();

  console.log(`[1/3] Verificando usuário no Supabase Auth: ${ADMIN_EMAIL}`);

  // 1. Tentar encontrar o usuário no auth
  const { data: users, error: listError } = await supabase.auth.admin.listUsers();

  if (listError) {
    throw new Error(`Erro ao listar usuários do Auth: ${listError.message}`);
  }

  const existingAuthUser = (users.users as Array<{ email?: string; id: string }>).find(
    (u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
  );

  let authUserId: string;

  if (existingAuthUser) {
    console.log(`   Usuário já existe no Auth (id: ${existingAuthUser.id})`);
    authUserId = existingAuthUser.id;

    // Opcional: garantir senha (se quiser redefinir)
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      authUserId,
      { password: ADMIN_PASSWORD }
    );
    if (updateError) {
      console.warn(`   Aviso ao atualizar senha: ${updateError.message}`);
    } else {
      console.log(`   Senha atualizada com sucesso.`);
    }
  } else {
    console.log(`   Criando usuário no Auth...`);
    const { data: created, error: createError } =
      await supabase.auth.admin.createUser({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        email_confirm: true,
        user_metadata: { name: ADMIN_NAME },
      });

    if (createError) {
      throw new Error(`Erro ao criar usuário no Auth: ${createError.message}`);
    }

    if (!created.user) {
      throw new Error('Usuário não foi retornado após criação.');
    }

    authUserId = created.user.id;
    console.log(`   Usuário criado no Auth (id: ${authUserId})`);
  }

  // 2. Criar/atualizar perfil na tabela `users`
  console.log(`[2/3] Criando/atualizando perfil na tabela 'users'...`);

  const now = new Date().toISOString();

  const { error: upsertError } = await supabase
    .from('users')
    .upsert(
      {
        id: authUserId,
        email: ADMIN_EMAIL.toLowerCase(),
        display_name: ADMIN_NAME,
        role: 'admin',
        created_at: now,
        last_login_at: null,
      },
      { onConflict: 'id' } // chave primária da tabela users
    );

  if (upsertError) {
    throw new Error(`Erro ao criar perfil na tabela users: ${upsertError.message}`);
  }

  console.log(`   Perfil criado/atualizado com role 'admin'.`);

  // 3. Verificar resultado final
  console.log(`[3/3] Verificando perfil final...`);

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('id, email, display_name, role, created_at, last_login_at')
    .eq('id', authUserId)
    .single();

  if (profileError) {
    throw new Error(`Erro ao buscar perfil: ${profileError.message}`);
  }

  console.log(`\n=== ADMIN CRIADO COM SUCESSO ===`);
  console.log(`ID:         ${profile.id}`);
  console.log(`Email:      ${profile.email}`);
  console.log(`Nome:       ${profile.display_name}`);
  console.log(`Role:       ${profile.role}`);
  console.log(`Criado em:  ${profile.created_at}`);
  console.log(`================================\n`);

  console.log(`\nAgora você pode fazer login em:`);
  console.log(`  POST /api/auth/login`);
  console.log(`  Body: { "email": "${ADMIN_EMAIL}", "password": "${ADMIN_PASSWORD}" }`);
}

main().catch((err) => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
