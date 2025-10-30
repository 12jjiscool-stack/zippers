
/**
 * Simple ZIPPED proxy for Netlify Functions.
 * - Accepts query param `url` (full https://... or zipped://...)
 * - Streams HTML or binary back to the client.
 * - For HTML: removes <script> tags to avoid running remote JS, injects a small badge.
 *
 * Note: Netlify uses Node 18+ where global fetch is available. If your environment needs node-fetch,
 * change this file to import('node-fetch') and use that.
 */
const { Buffer } = require('buffer');

exports.handler = async function(event) {
  try {
    const qs = event.queryStringParameters || {};
    let raw = (qs.url || '').trim();
    if (!raw) return { statusCode: 400, body: 'Missing url parameter. Example: ?url=https://example.com' };

    // support zipped:// scheme -> https://
    if (raw.startsWith('zipped://')) raw = raw.replace(/^zipped:\/\//i, 'https://');

    // basic validation
    let target;
    try { target = new URL(raw); } catch(e) { return { statusCode: 400, body: 'Invalid URL' }; }
    if (!/^https?:$/.test(target.protocol)) return { statusCode: 400, body: 'Unsupported protocol' };

    // fetch target
    const res = await fetch(target.href, {
      headers: {
        'user-agent': 'ZippedProxy/1.0 (+https://example.com)'
      }
    });

    const contentType = res.headers.get('content-type') || '';

    // If HTML, rewrite a bit: remove scripts and inject badge
    if (contentType.includes('text/html')) {
      let html = await res.text();

      // remove <script>...</script>
      html = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');

      // remove CSP meta tags
      html = html.replace(/<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '');

      // Inject badge before </body>
      const badge = '<div style="position:fixed;right:8px;bottom:8px;z-index:9999;padding:6px 10px;background:rgba(0,0,0,0.6);color:white;border-radius:6px;font-size:12px;">ZIPPED</div>';
      if (html.includes('</body>')) html = html.replace('</body>', badge + '</body>');
      else html += badge;

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: html
      };
    }

    // For non-HTML, return base64-encoded body so Netlify serves correctly
    const arrayBuffer = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);
    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: { 'Content-Type': contentType },
      body: buf.toString('base64')
    };

  } catch (err) {
    return { statusCode: 500, body: 'Proxy error: ' + String(err.message) };
  }
};
