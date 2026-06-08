import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { data: me } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    const role = (me?.role ?? '').toLowerCase()
    if (role !== 'admin' && role !== 'director') {
      return NextResponse.json({ error: '관리자 또는 디렉터만 수정할 수 있습니다.' }, { status: 403 })
    }

    const { id, guardian, phone, address, note } = await request.json()
    if (!id) return NextResponse.json({ error: '유저 ID가 필요합니다.' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ guardian: guardian ?? null, phone: phone ?? null, address: address ?? null, note: note ?? null })
      .eq('id', id)
      .select('id, guardian, phone, address, note')
      .single()

    if (error) throw error
    return NextResponse.json({ user: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
