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

    const body = await request.json()
    const { id } = body
    if (!id) return NextResponse.json({ error: '유저 ID가 필요합니다.' }, { status: 400 })

    const updates: Record<string, unknown> = {}
    if ('guardian'       in body) updates.guardian       = body.guardian       ?? null
    if ('phone'          in body) updates.phone          = body.phone          ?? null
    if ('address'        in body) updates.address        = body.address        ?? null
    if ('note'           in body) updates.note           = body.note           ?? null
    if ('is_active'      in body) updates.is_active      = body.is_active
    if ('birth_date'     in body) updates.birth_date     = body.birth_date     ?? null
    if ('grade'          in body) updates.grade          = body.grade          ?? null
    if ('guardian_phone' in body) updates.guardian_phone = body.guardian_phone ?? null

    const { data, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', id)
      .select('id, guardian, phone, address, note, is_active, birth_date, grade, guardian_phone')
      .single()

    if (error) throw error
    return NextResponse.json({ user: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
