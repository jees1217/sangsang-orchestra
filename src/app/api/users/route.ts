import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 마스터키 전용 Admin 클라이언트 (최상단 고정)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// [1] 신규 단원 추가 (POST) - 기수 및 악기 추가됨
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name, role, cohort, instrument } = body;

    // 1. 수파베이스 Auth에 계정 생성
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) throw authError;

    // 2. public.users 테이블에 상세 정보(기수, 악기 포함) 저장
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .upsert({
        id: authData.user.id,
        email: email,
        name: name,
        role: role || 'student',
        cohort: cohort ? Number(cohort) : null,       // [추가] 숫자형으로 변환하여 저장
        instrument: instrument ? instrument.trim() : null // [추가] 악기명 저장
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