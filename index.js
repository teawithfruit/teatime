'use strict';

process.setMaxListeners(0);
process.binding('http_parser').HTTPParser = require('http-parser-js').HTTPParser;
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
process.on('exit', function (code) {
  console.log("Process exits with code: " + code);
});

var Teatime = undefined;

var Q = require('q');
var r = require('request').defaults({
  followRedirect : true,
  pool: {
    maxSockets: 3
  } // TO BE EVALUATED!!!!
});
var request = require('request-promise');
var cheerio = require('cheerio');
var fs = require('fs-extra');
var path = require('path');
var fileType = require('file-type');
var crypto = require('crypto');
var url = require('url');
var defaults = require('defaults');
var helpers = require('./lib/helpers');

var matchHostname = /(\.|\/\/)(?!(w+)\.)\S*(?:\w+\.)+\w+/i;

var userAgentPrefix = 'Mozilla/5.0 (Unknown; Linux i686) AppleWebKit/534.34 (KHTML, like Gecko) Safari/534.34';

var DEFAULTS = {
  crawl: false,
  getVariables: false,
  timeout: 30000,
  userAgent: 'teatime spider'
};

module.exports = Teatime = function (initURL, options) {
  this.startUrl = initURL;
  this.startUrlParsed = url.parse(this.startUrl);
  this.resultPath = '';
  var resultDir = path.resolve(__dirname, 'file', this.startUrlParsed.hostname);
  this.resultPath = path.join(resultDir, 'theData.json');
  fs.ensureDirSync(resultDir);
  this.options = defaults(options, DEFAULTS);
  this.pending = [];
  this.visited = {};
  this.deferred = null;
  this.running = false;
};

Teatime.prototype.start = function () {
  if (this.running) {
    throw new Error('Crawler is already running. Wait for the end!');
  }
  this.deferred = Q.defer();
  fs.writeFile(this.resultPath, '{', 'utf-8', function (err) {
    if (err) {
      this.running = false;
      this.deferred.reject(err);
    }
    this.pending.push(this.startUrl);
    this.crawl(true);
  }.bind(this));
  return this.deferred.promise;
};

Teatime.prototype.end = function () {
  fs.appendFile(this.resultPath, '}', 'utf-8', function (err) {
    if (err) {
      this.running = false;
      this.deferred.reject(err);
    }
    var result = fs.readFileSync(this.resultPath, 'utf8');
    this.running = false;
    this.deferred.resolve(JSON.parse(result));
  }.bind(this));
};

function writeUrl(path, first, url, data, callback) {
  for (var key in data) {
    data[key] = encodeURI(data[key]);
  }
  var writeString = '\n"' + encodeURI(url) + '" : ' + JSON.stringify(data);
  if (!first) {
    writeString = ',' + writeString;
  }
  
  fs.appendFile(path, writeString, 'utf-8', callback);
}

Teatime.prototype.open = function (first, theUrl, callback) {
  if (!this.options.domain)
    this.options.domain = theUrl.match(matchHostname)[0];
  if (!this.options.cookie)
    this.options.cookie = r.jar();
  var urlParsed = url.parse(theUrl);
  this.visited[urlParsed.href] = true;
  if (urlParsed.href && /http|https/.test(urlParsed.protocol)) {
    var hadError = false;
    var gotData = false;
    var theFileType = undefined;
    var req = r.get({url: urlParsed.href, timeout: this.options.timeout, jar: this.options.cookie, headers: {'User-Agent': userAgentPrefix + ' ' + this.options.userAgent}})
            .on('error', function (err) {
              hadError = true;
              writeUrl(this.resultPath, first, theUrl, {status: err, mime: null, length: null, links: []}, callback);
            }.bind(this))
            .on('end', function () {
              if (gotData) {
                if (!/application|image|video/.test(theFileType)) {
                  this.bodyRequest(first, theUrl, urlParsed, theFileType, callback);
                } else {
                  callback();
                }
              } else if (!hadError) {
                writeUrl(this.resultPath, first, theUrl, {status: 'No data', mime: null, length: null, links: []}, callback);
              }
            }.bind(this))
            .once('data', function (chunk) {
              gotData = true;
              
              theFileType = fileType(chunk);
              if (theFileType) {
                theFileType = theFileType.mime;
              }
                
              req.abort();
            }.bind(this));
  } else {
    callback();
  }
};

Teatime.prototype.checkAnchor = function (newUrls, $, requestHref, links) {
  $(newUrls).each(function (i, link) {
    if ($(link).attr('href') !== undefined) {
      var theNew = url.parse($(link).attr('href')).href;

      if ($('base').attr('href') && !/^\/$/i.test(theNew) && !/^http.*$/i.test(theNew))
        theNew = $('base').attr('href') + theNew;
      if (theNew && url.parse(theNew).host === null)
        theNew = helpers.absoluteUri(requestHref, theNew);

      if (theNew) {
        if (this.options.getVariables === false)
          theNew = theNew.replace(/\?.*$/, '');
        theNew = theNew.replace(/\#.*$/, '');
        theNew = theNew.replace(/\;.*$/, '');
      }

      if (theNew && links.indexOf(theNew) === -1)
        links.push(theNew);
      if (this.pending.indexOf(theNew) === -1 && !this.visited[theNew] && !/mailto:|javascript/i.test(theNew) && theNew !== undefined && theNew !== null)
        this.pending.push(theNew);
    }
  }.bind(this));
};

Teatime.prototype.bodyRequest = function (first, theUrl, urlParsed, fileType, callback) {
  var theLinks = [];

  request({uri: urlParsed.href, simple: false, resolveWithFullResponse: true, timeout: this.options.timeout, jar: this.options.cookie, headers: {'User-Agent': userAgentPrefix + ' ' + this.options.userAgent}})
          .then(function (response) {
            var theStatus, theLength = 0, bodyPath, filename = crypto.createHash('sha1').update(theUrl).digest("hex");

            if (response.request._redirect.redirects.length <= 0) {
              var testDomain = new RegExp(this.options.domain, 'g');
              if (testDomain.test(response.request.uri.href.match(matchHostname)[0])
                      && /text\/html|text\/xml/.test(response.headers['content-type'])) {

                var $ = cheerio.load(response.body);
                var newUrls = $('a');

                if (this.options.crawl === true && newUrls !== null) {
                  this.checkAnchor(newUrls, $, response.request.uri.href, theLinks);
                }
              }

              theStatus = response.statusCode;
              fileType = response.headers['content-type'];
              theLength = response.headers['content-length'];

              bodyPath = path.resolve(__dirname, 'file', this.startUrlParsed.hostname, filename);
              fs.writeFileSync(bodyPath, response.body);
            } else {
              theLinks.push(response.request._redirect.redirects[0]['redirectUri']);
              theStatus = response.request._redirect.redirects[0]['statusCode'];
              if (!this.visited[response.request._redirect.redirects[0]['redirectUri']]) {
                this.pending.unshift(response.request._redirect.redirects[0]['redirectUri']);
              }
            }
            writeUrl(this.resultPath, first, theUrl, {status: theStatus, mime: fileType, length: theLength, body: bodyPath, links: theLinks}, callback);
          }.bind(this))
          .catch(function (error) {
            console.log("ERROR BODY REQUEST");
            console.log(error);
            writeUrl(this.resultPath, first, theUrl, {status: error, mime: null, length: null, links: []}, callback);
          }.bind(this));
};

Teatime.prototype.crawl = function (first) {
  first = first || false;
  
  if (this.options.crawl === true && this.pending.length > 0) {
    this.open(first, this.pending.shift(), this.crawl.bind(this));
  } else {
    this.end();
  }
};