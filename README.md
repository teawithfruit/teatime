# Teatime
A module to generate a json map of choosen website.

##How to use
```
'use strict';

var Teatime = require('../');
var teatime = new Teatime('http://www.teawithfruit.com/', { crawl: true, getVariables: false, timeout: 30000, userAgent: 'teatime spider' });

teatime.start().then(function(data) {
  console.log(data);
});
```
