var url = require('url');
var crypto = require('crypto');

// Turn a (possibly) relative URI into a full RFC 3986-compliant URI
// With minor modifications, courtesy: https://gist.github.com/Yaffle/1088850
function absoluteUri(base, href) {

  // Parse a URI and return its constituent parts
  function parseUri(url) {
    var match = String(url).replace(/^\s+|\s+$/g, '').match(/^([^:\/?#]+:)?(\/\/(?:[^:@]*(?::[^:@]*)?@)?(([^:\/?#]*)(?::(\d*))?))?([^?#]*)(\?[^#]*)?(#[\s\S]*)?/);
    return (match ? { href: match[0] || '', protocol: match[1] || '', authority: match[2] || '', host: match[3] || '', hostname: match[4] || '',
                      port: match[5] || '', pathname: match[6] || '', search: match[7] || '', hash: match[8] || '' } : null);
  }

  // Resolve dots in the path
  function resolvePathDots(input) {
    var output = [];
    input.replace(/^(\.\.?(\/|$))+/, '')
         .replace(/\/(\.(\/|$))+/g, '/')
         .replace(/\/\.\.$/, '/../')
         .replace(/\/?[^\/]*/g, function (part) { part === '/..' ? output.pop() : output.push(part); });
    return output.join('').replace(/^\//, input.charAt(0) === '/' ? '/' : '');
  }

  // Parse base and href 
  href = parseUri(href || '');
  base = parseUri(base || '');

  // Build and return the URI 
  return !href || !base ? null : (href.protocol || base.protocol) +
         (href.protocol || href.authority ? href.authority : base.authority) +
         (resolvePathDots(href.protocol || href.authority || href.pathname.charAt(0) === '/' ? href.pathname : (href.pathname ? ((base.authority && !base.pathname ? '/' : '') + base.pathname.slice(0, base.pathname.lastIndexOf('/') + 1) + href.pathname) : base.pathname))) +
         (href.protocol || href.authority || href.pathname ? href.search : (href.search || base.search)) + href.hash;

}

function getFileName(u) {

  var lengthBeforeCut = 180;
  var urlComponents = url.parse(u);
  var name = urlComponents.pathname;

  // if we only have a slash, just call it the hostname
  if (name === '/') {
    name = urlComponents.hostname;
  } else {
    // replace all the slashes and if the url is too long
    // cut it
    if(urlComponents.pathname) {
      name = urlComponents.pathname.replace(/\//g, '-');
    } else {
      name = crypto.createHash('md5').update(u).digest('hex').substr(0, 8);
    }
    
    if (name.lastIndexOf('-', 0) === 0) {
      name = urlComponents.hostname + '-' + name.slice(1, name.length);
    }

    if (name.length > lengthBeforeCut) {
      name = name.slice(0, lengthBeforeCut);
    }
  }

  // add a small md5-sum, taking care of URL:s with request parameters
  if (urlComponents.query) {
    name = name + crypto.createHash('md5').update(u).digest('hex').substr(0, 5);
  }

  // if the URL is https, add a s to make sure it doesn't
  // collide with http URLs
  if (urlComponents.protocol === 'https:') {
    name = 's-' + name;
  }
  
  return name;
}

exports.getFileName = getFileName;
exports.absoluteUri = absoluteUri;