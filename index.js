'use strict';

process.binding('http_parser').HTTPParser = require('http-parser-js').HTTPParser;
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

var Teatime = undefined;

var Q = require('q');
var r = require('request');
var request = require('request-promise');
var cheerio = require('cheerio');
var fs = require('fs-extra');
var mime = require('mime-types');
var fileType = require('file-type');
var util = require('util');
var url = require('url');
var EventEmitter = require('events').EventEmitter;
var defaults = require('defaults');
var helpers = require('./lib/helpers');

var pending = [];
var visited = [];
var theData = [];

var matchURLs = /\shref=(?:(?:'([^']*)')|(?:"([^"]*)")|([^\s]*))/g;
var matchHostname = /(?!(w+)\.)\w*(?:\w+\.)+\w+/i;

var DEFAULTS = {
  crawl: false
};

module.exports = Teatime = function(options) {
  this.options = defaults(options, DEFAULTS);

  return this.init();
};

Teatime.prototype.init = function() {
  return 'fdsgdsfg';
};

Teatime.prototype.open = function(theUrl) {
  var that = this;

  if(!this.options.domain) this.options.domain = theUrl.match(matchHostname)[0];
  var urlParsed = url.parse(theUrl);

  visited.push(urlParsed.href);

  if(urlParsed.href && /http|https/.test(urlParsed.protocol)) {
    r.get({ url: urlParsed.href, timeout: 30000 })
    .on('error', function(err) {
      console.log('first request: ' + err);

      if(that.options.crawl == true) that.crawl();
    })
    .once('data', function(chunk) {
      var theFileType = undefined;

      theFileType = fileType(chunk);
      if(theFileType) theFileType = theFileType.mime;
      this.abort();

      if(!/application|image|video/.test(theFileType) ) {
        request({ uri: urlParsed.href, simple: false, resolveWithFullResponse: true, timeout: 30000 })
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
                        theNew = theNew.replace(/\?.*$/, '');
                        theNew = theNew.replace(/\#.*$/, '');
                        theNew = theNew.replace(/\;.*$/, '');
                      }

                      if(pending.indexOf(theNew) == -1 && visited.indexOf(theNew) == -1 && !/mailto:|javascript/i.test(theNew) && theNew != undefined && theNew != null) pending.push(theNew);
                    }
                  });
                }
              }

            }
          } else {
            if(visited.indexOf(response.request._redirect.redirects[0]['redirectUri']) == -1) pending.unshift(response.request._redirect.redirects[0]['redirectUri']);
          }
        })
        .then(function() {
          if(that.options.crawl == true) that.crawl();
        })
        .catch(function (error) {
          console.log('second request: ' + error);

          if(that.options.crawl == true) that.crawl();
        });
      } else {
        if(that.options.crawl == true) that.crawl();
      }
    });
  } else {
    if(that.options.crawl == true) that.crawl();
  }



};

Teatime.prototype.crawl = function() {
  var next = undefined;

  if(pending.length > 0) {
    next = pending.shift();
    console.log('Pending: ' + pending.length);
    console.log(next);

    this.open(next);
  } else {
    console.log(visited);
  }
};
