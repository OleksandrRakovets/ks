/** Keep 404s under the locale layout so its middleware seeds the locale for the root error boundary. */
export function loader() {
  throw new Response('Not Found', { status: 404 })
}

export default function NotFound() {
  return null
}
