import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

// 마스터키 전용 Admin 클라이언트 (최상단 고정)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// 서비스 롤 키로 RLS를 우회하는 라우트이므로, 매 요청마다 호출자가 admin/director인지 직접 검증해야 함
// (이 검증이 없으면 인증 없이도 누구나 계정 생성/삭제/비밀번호 재설정이 가능해짐)
async function requireAdminOrDirector() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: '인증이 필요합니다.' };

  const { data: me } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = (me?.role ?? '').toLowerCase();
  if (role !== 'admin' && role !== 'director') {
    return { ok: false as const, status: 403, error: '관리자 또는 옵저버만 접근할 수 있습니다.' };
  }
  return { ok: true as const };
}

// [1] 신규 단원 추가 (POST) - 기수 및 악기 추가됨
export async function POST(request: Request) {
  try {
    const auth = await requireAdminOrDirector();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const { email, password, name, role, cohort, instrument, is_active,
            birth_date, grade, phone, guardian, guardian_phone, address, note } = body;

    // 1. 수파베이스 Auth에 계정 생성
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) throw authError;

    // 2. public.users 테이블에 상세 정보 저장
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .upsert({
        id: authData.user.id,
        email,
        name,
        role: role || 'student',
        cohort: cohort ? Number(cohort) : null,
        instrument: instrument ? instrument.trim() : null,
        is_active: is_active !== false,
        birth_date:     birth_date     || null,
        grade:          grade          || null,
        phone:          phone          || null,
        guardian:       guardian       || null,
        guardian_phone: guardian_phone || null,
        address:        address        || null,
        note:           note           || null,
      })
      .select()
      .single();

    if (userError) throw userError;

    return NextResponse.json({ user: userData });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

// [2] 기존 단원 삭제 (DELETE)
export async function DELETE(request: Request) {
  try {
    const auth = await requireAdminOrDirector();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');

    if (!userId) {
      return NextResponse.json({ error: '유저 ID가 필요합니다.' }, { status: 400 });
    }

    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authError) throw authError;

    const { error: userError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', userId);

    if (userError) throw userError;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

// [3] 관리자 직권 비밀번호 초기화 (PATCH)
export async function PATCH(request: Request) {
  try {
    const auth = await requireAdminOrDirector();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id, password } = await request.json();

    if (!id || !password) {
      return NextResponse.json({ error: '유저 ID와 새 비밀번호가 필요합니다.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      id,
      { password: password }
    );

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}