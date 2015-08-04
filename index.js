'use strict';

process.setMaxListeners(0);
process.binding('http_parser').HTTPParser = require('http-parser-js').HTTPParser;
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

var Teatime = undefined;

var Q = require('q');
var r = require('request');
var request = require('request-promise');
var cheerio = require('cheerio');
var fs = require('fs-extra');
var path = require('path');
var fileType = require('file-type');
var util = require('util');
var crypto = require('crypto');
var url = require('url');
var EventEmitter = require('events').EventEmitter;
var defaults = require('defaults');
var helpers = require('./lib/helpers');

var pending = [];
var visited = [];
var promises = [];
var theData = undefined;
var writeIt = undefined;
var theDataStream = undefined;

var matchURLs = /\shref=(?:(?:'([^']*)')|(?:"([^"]*)")|([^\s]*))/g;
var matchHostname = /(\.|\/\/)(?!(w+)\.)\S*(?:\w+\.)+\w+/i;

var userAgentPrefix = 'Mozilla/5.0 (Unknown; Linux i686) AppleWebKit/534.34 (KHTML, like Gecko) Safari/534.34';

var startUrl = undefined;
var startUrlParsed = undefined;
var DEFAULTS = {
  crawl: false,
  getVariables: false,
  timeout: 30000,
  userAgent: 'teatime spider'
};

var deferred = Q.defer();

module.exports = Teatime = function(initURL, options) {
  var that = this;
  this.startUrl = initURL;
  this.startUrlParsed = url.parse(this.startUrl);
  this.options = defaults(options, DEFAULTS);
  
  fs.ensureDirSync(path.resolve(__dirname, 'file', this.startUrlParsed.hostname));
  theDataStream = fs.createWriteStream(path.resolve(__dirname, 'file', this.startUrlParsed.hostname, 'theData.json'));
  theDataStream.write('{\n');
  theDataStream.on('finish', function() {
    var loaded = fs.readFileSync(path.resolve(__dirname, 'file', that.startUrlParsed.hostname, 'theData.json'), 'utf8');
    loaded = loaded.substr(0, loaded.length - 3) + '}';
    deferred.resolve(JSON.parse(loaded));
  });

  this.open(this.startUrl);

  return deferred.promise;
};

Teatime.prototype.open = function(theUrl) {
  var that = this;
  var theData = {};

  if(!this.options.domain) this.options.domain = theUrl.match(matchHostname)[0];
  if(!this.options.cookie) this.options.cookie = r.jar();
  var urlParsed = url.parse(theUrl);

  visited.push(urlParsed.href);

  if(urlParsed.href && /http|https/.test(urlParsed.protocol)) {
    r.get({ url: urlParsed.href, timeout: that.options.timeout, jar: this.options.cookie, headers: { 'User-Agent': userAgentPrefix + ' ' + that.options.userAgent } })
    .on('error', function(err) {
      theData[theUrl] = { status: err, mime: null, length: null, links: [] };
      writeIt = JSON.stringify(theData);
      theDataStream.write(writeIt.substr(1, writeIt.length - 2) + ',\n');

      that.crawl();
    })
    .on('end', function() {
      if(this.response.connection._writableState.ended) {
        theData[theUrl] = { status: this.response.statusCode, mime: this.response.headers['content-type'], length: this.response.headers['content-length'], links: [] };
        writeIt = JSON.stringify(theData);
        theDataStream.write(writeIt.substr(1, writeIt.length - 2) + ',\n');

        this.abort();
        that.crawl();
      } 
    })
    .once('data', function(chunk) {
      var theLinks = [];
      var theStatus = undefined;
      var theFileType = undefined;
      var theBody = undefined;
      var theLength = 0;

      var workerPromise = Q.defer();
      promises.push(workerPromise.promise);

      theFileType = fileType(chunk);
      if(theFileType) theFileType = theFileType.mime;
      this.abort();

      if(!/application|image|video/.test(theFileType)) {
        request({ uri: urlParsed.href, simple: false, resolveWithFullResponse: true, timeout: that.options.timeout, jar: that.options.cookie, headers: { 'User-Agent': userAgentPrefix + ' ' + that.options.userAgent } })
        .then(function(response) {

          if(response.request._redirect.redirects.length <= 0) {
            var testDomain = new RegExp(that.options.domain, 'g');
            if(testDomain.test(response.request.uri.href.match(matchHostname)[0])) {
              if(/text\/html|text\/xml/.test(response.headers['content-type'])) {

                var $ = cheerio.load(response.body);
                var newUrls = $('a');

                if(that.options.crawl == true && newUrls != null) {
                  $(newUrls).each(function(i, link) {
                    if($(link).attr('href') != undefined) {
                      var theNew = url.parse($(link).attr('href')).href;

                      if($('base').attr('href') && !/^\/$/i.test(theNew) && !/^http.*$/i.test(theNew)) theNew = $('base').attr('href') + theNew;
                      if(theNew && url.parse(theNew).host == null) theNew = helpers.absoluteUri(response.request.uri.href, theNew);

                      if(theNew) {
                        if(that.options.getVariables == false) theNew = theNew.replace(/\?.*$/, '');
                        theNew = theNew.replace(/\#.*$/, '');
                        theNew = theNew.replace(/\;.*$/, '');
                      }

                      if(theNew && theLinks.indexOf(theNew) == -1) theLinks.push(theNew);
                      if(pending.indexOf(theNew) == -1 && visited.indexOf(theNew) == -1 && !/mailto:|javascript/i.test(theNew) && theNew != undefined && theNew != null) pending.push(theNew);
                    }
                  });
                }
              }

            }

            
            theStatus = response.statusCode;
            theFileType = response.headers['content-type'];
            theLength = response.headers['content-length'];

            var filename = crypto.createHash('sha1').update(theUrl).digest("hex");
            fs.writeFileSync(path.resolve(__dirname, 'file', that.startUrlParsed.hostname, filename), response.body);
            theBody = path.resolve(__dirname, 'file', that.startUrlParsed.hostname, filename);
          } else {
            theLinks.push(response.request._redirect.redirects[0]['redirectUri']);
            theStatus = response.request._redirect.redirects[0]['statusCode'];
            if(visited.indexOf(response.request._redirect.redirects[0]['redirectUri']) == -1) pending.unshift(response.request._redirect.redirects[0]['redirectUri']);
          }

          return { status: theStatus, type: theFileType, length: theLength, body: theBody };
        })
        .then(function(response) {
          theData[theUrl] = { status: response.status, mime: response.type, length: response.length, body: response.body, links: theLinks };
          writeIt = JSON.stringify(theData);
          theDataStream.write(writeIt.substr(1, writeIt.length - 2) + ',\n');

          workerPromise.resolve();
          that.crawl();
        })
        .catch(function(error) {
          theData[theUrl] = { status: error, mime: null, length: null, links: [] };
          writeIt = JSON.stringify(theData);
          theDataStream.write(writeIt.substr(1, writeIt.length - 2) + ',\n');

          that.crawl();
        });
      } else {
        that.crawl();
      }
    });
  } else {
    that.crawl();
  }
};

Teatime.prototype.crawl = function() {
  var next = undefined;

  if(this.options.crawl == true) {
    if(pending.length > 0) {
      next = pending.shift();

      this.open(next);
    } else {
      Q.allSettled(promises)
      .then(function() {
        theDataStream.end('}');
      });
    }
  } else {
    Q.allSettled(promises)
    .then(function() {
      theDataStream.end('}');
    });
  }
};