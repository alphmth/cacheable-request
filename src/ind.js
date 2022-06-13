const func = require('./normalize');

console.log(func('http://user:pass@localhost/', {
					stripWWW: false,
					removeTrailingSlash: false,
					stripAuthentication: false,
				},).then(x => x));