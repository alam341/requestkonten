import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const { name, email, password, wa_number, specializations } = await req.json();

    // 1. Buat user di Supabase Auth
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authErr) throw authErr;

    // 2. Insert ke tabel creators
    const { error: creatorErr } = await supabase
      .from('creators')
      .insert({
        name,
        email,
        wa_number,
        specializations,
        user_id: authData.user.id,
      });

    if (creatorErr) {
      // Rollback: hapus user auth kalau insert creators gagal
      await supabase.auth.admin.deleteUser(authData.user.id);
      throw creatorErr;
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  }
});

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}
