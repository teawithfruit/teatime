'use strict';

var Teatime = require('../');
var teatime = new Teatime('http://www.bmas.de/', { crawl: true, getVariables: false, timeout: 30000, userAgent: 'teatime spider' });

teatime.start().then(function(data) {
  console.log(data);
});