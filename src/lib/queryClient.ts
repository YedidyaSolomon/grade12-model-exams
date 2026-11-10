import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      // Slow mobile data: don't refetch everything each time the tab regains focus.
      refetchOnWindowFocus: false,
    },
  },
})
