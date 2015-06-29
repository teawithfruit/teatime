'use strict';

var Teatime = require('../');
var teatime = new Teatime({ crawl: true, getVariables: false });

teatime.open('http://www.teawithfruit.com/');