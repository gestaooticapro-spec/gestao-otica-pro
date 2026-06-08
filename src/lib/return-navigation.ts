export function withReturnTo(target: string, returnTo?: string | null) {
  if (!returnTo) return target

  const [pathname, queryString = ''] = target.split('?')
  const params = new URLSearchParams(queryString)
  params.set('returnTo', returnTo)

  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

export function currentPathWithSearch(pathname: string, searchParams: { toString(): string }) {
  const query = searchParams.toString()
  return query ? `${pathname}?${query}` : pathname
}
