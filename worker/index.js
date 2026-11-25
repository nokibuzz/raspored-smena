export default {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/' || path === '/index.html') {
      return new Response(__PAGE__, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, max-age=300',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer'
        }
      });
    }
    return new Response('Not found', { status: 404 });
  }
};
