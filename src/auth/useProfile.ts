import { useQuery } from '@tanstack/react-query'
import { supabase, type Profile } from '@/lib/supabase'
import { useAuth } from './AuthProvider'

export const profileQueryKey = (userId: string | undefined) => ['profile', userId] as const

/** The signed-in user's own profile row (RLS only returns this one row). */
export function useProfile() {
  const { session } = useAuth()
  const userId = session?.user.id

  return useQuery({
    queryKey: profileQueryKey(userId),
    enabled: !!userId,
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId!)
        .single()
      if (error) throw error
      return data
    },
  })
}
