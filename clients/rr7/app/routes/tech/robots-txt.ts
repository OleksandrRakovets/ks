export function loader() {
  return new Response('User-agent: *\nDisallow: /', {
    headers: {
      'Content-Type': 'text/plain',
    },
  })
}
