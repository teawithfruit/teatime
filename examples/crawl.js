'use strict';

var Teatime = require('../');
var teatime = new Teatime({ crawl: true, getVariables: false, timeout: 30000, userAgent: 'teatime spider' });

teatime.open('http://www.teawithfruit.com/');