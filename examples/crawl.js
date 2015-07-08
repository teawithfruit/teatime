'use strict';

var Teatime = require('../');
var teatime = new Teatime('http://www.teawithfruit.com/', { crawl: true, getVariables: false, timeout: 30000, userAgent: 'teatime spider' });

teatime.then(function(data) {
  console.log(data);
});