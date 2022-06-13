// /* eslint-disable unicorn/prefer-module */
// /* eslint-disable node/no-deprecated-api */
// const EventEmitter = require('events');
// const { request } = require('http');
// const { PassThrough } = require('stream');
// const url = require('url');
// const { promisify } = require('util');
// const test = require('ava');
// const createTestServer = require('create-test-server');
// const getStream = require('get-stream');
// const CacheableRequest = require('this');

// let s;

// test.before('setup', async () => {
// 	s = await createTestServer();
// 	s.get('/', (request_, response_) => {
// 		response_.setHeader('cache-control', 'max-age=60');
// 		response_.end('hi');
// 	});
// 	s.post('/', (request_, response_) => response_.status(201).end('hello'));
// });

// test.after('cleanup', async () => {
// 	await s.close();
// });

// test('cacheableRequest is a function', t => {
// 	const cacheableRequest = new CacheableRequest(request);
// 	t.is(typeof cacheableRequest, 'function');
// });

// test('cacheableRequest returns an event emitter', t => {
// 	const cacheableRequest = new CacheableRequest(request);
// 	const returnValue = cacheableRequest(url.parse(s.url), () => t.pass()).on('request', request_ => request_.end());
// 	t.true(returnValue instanceof EventEmitter);
// });

// const withCallback = fn => async t => {
// 	await promisify(fn)(t);
// };

// test('cacheableRequest passes requests through if no cache option is set', withCallback((t, end) => {
// 	const cacheableRequest = new CacheableRequest(request);
// 	cacheableRequest(url.parse(s.url), async response => {
// 		const body = await getStream(response);
// 		t.is(body, 'hi');
// 		end();
// 	}).on('request', request_ => request_.end());
// }));

// test('cacheableRequest accepts url as string', withCallback((t, end) => {
// 	const cacheableRequest = new CacheableRequest(request);
// 	cacheableRequest(s.url, async response => {
// 		const body = await getStream(response);
// 		t.is(body, 'hi');
// 		end();
// 	}).on('request', request_ => request_.end());
// }));

// test('cacheableRequest accepts url as URL', withCallback((t, end) => {
// 	const cacheableRequest = new CacheableRequest(request);
// 	cacheableRequest(new url.URL(s.url), async response => { // eslint-disable-line node/prefer-global/url
// 		const body = await getStream(response);
// 		t.is(body, 'hi');
// 		end();
// 	}).on('request', request_ => request_.end());
// }));

// test('cacheableRequest handles no callback parameter', withCallback((t, end) => {
// 	const cacheableRequest = new CacheableRequest(request);
// 	cacheableRequest(url.parse(s.url)).on('request', request_ => {
// 		request_.end();
// 		request_.on('response', response => {
// 			t.is(response.statusCode, 200);
// 			end();
// 		});
// 	});
// }));

// test('cacheableRequest emits response event for network responses', withCallback((t, end) => {
// 	const cacheableRequest = new CacheableRequest(request);
// 	cacheableRequest(url.parse(s.url))
// 		.on('request', request_ => request_.end())
// 		.on('response', response => {
// 			t.false(response.fromCache);
// 			end();
// 		});
// }));

// test('cacheableRequest emits response event for cached responses', withCallback((t, end) => {
// 	const cacheableRequest = new CacheableRequest(request);
// 	const cache = new Map();
// 	const options = Object.assign(url.parse(s.url), { cache });
// 	cacheableRequest(options, () => {
// 		// This needs to happen in next tick so cache entry has time to be stored
// 		setImmediate(() => {
// 			cacheableRequest(options)
// 				.on('request', request_ => request_.end())
// 				.on('response', response => {
// 					t.true(response.fromCache);
// 					end();
// 				});
// 		});
// 	}).on('request', request_ => request_.end());
// }));

// test('cacheableRequest emits CacheError if cache adapter connection errors', withCallback((t, end) => {
// 	const cacheableRequest = new CacheableRequest(request, 'sqlite://non/existent/database.sqlite');
// 	cacheableRequest(url.parse(s.url))
// 		.on('error', error => {
// 			t.true(error instanceof CacheableRequest.CacheError);
// 			t.is(error.code, 'SQLITE_CANTOPEN');
// 			end();
// 		})
// 		.on('request', request_ => request_.end());
// }));

// test('cacheableRequest emits CacheError if cache.get errors', withCallback((t, end) => {
// 	const errorMessage = 'Fail';
// 	const store = new Map();
// 	const cache = {
// 		get() {
// 			throw new Error(errorMessage);
// 		},
// 		set: store.set.bind(store),
// 		delete: store.delete.bind(store),
// 	};
// 	const cacheableRequest = new CacheableRequest(request, cache);
// 	cacheableRequest(url.parse(s.url))
// 		.on('error', error => {
// 			t.true(error instanceof CacheableRequest.CacheError);
// 			t.is(error.message, errorMessage);
// 			end();
// 		})
// 		.on('request', request_ => request_.end());
// }));

// test('cacheableRequest emits CacheError if cache.set errors', withCallback((t, end) => {
// 	const errorMessage = 'Fail';
// 	const store = new Map();
// 	const cache = {
// 		get: store.get.bind(store),
// 		set() {
// 			throw new Error(errorMessage);
// 		},
// 		delete: store.delete.bind(store),
// 	};
// 	const cacheableRequest = new CacheableRequest(request, cache);
// 	cacheableRequest(url.parse(s.url))
// 		.on('error', error => {
// 			t.true(error instanceof CacheableRequest.CacheError);
// 			t.is(error.message, errorMessage);
// 			end();
// 		})
// 		.on('request', request_ => request_.end());
// }));

// test('cacheableRequest emits CacheError if cache.delete errors', withCallback((t, end) => {
// 	const errorMessage = 'Fail';
// 	const store = new Map();
// 	const cache = {
// 		get: store.get.bind(store),
// 		set: store.set.bind(store),
// 		delete() {
// 			throw new Error(errorMessage);
// 		},
// 	};
// 	const cacheableRequest = new CacheableRequest(request, cache);

// 	(async () => {
// 		let i = 0;
// 		const s = await createTestServer();
// 		s.get('/', (request_, response_) => {
// 			const cc = i === 0 ? 'public, max-age=0' : 'public, no-cache, no-store';
// 			i++;
// 			response_.setHeader('Cache-Control', cc);
// 			response_.end('hi');
// 		});

// 		cacheableRequest(s.url, () => {
// 			// This needs to happen in next tick so cache entry has time to be stored
// 			setImmediate(() => {
// 				cacheableRequest(s.url)
// 					.on('error', async error => {
// 						t.true(error instanceof CacheableRequest.CacheError);
// 						t.is(error.message, errorMessage);
// 						await s.close();
// 						end();
// 					})
// 					.on('request', request_ => request_.end());
// 			});
// 		}).on('request', request_ => request_.end());
// 	})();
// }));

// test('cacheableRequest emits RequestError if request function throws', withCallback((t, end) => {
// 	const cacheableRequest = new CacheableRequest(request);
// 	const options = url.parse(s.url);
// 	options.headers = { invalid: '💣' };
// 	cacheableRequest(options)
// 		.on('error', error => {
// 			t.true(error instanceof CacheableRequest.RequestError);
// 			end();
// 		})
// 		.on('request', request_ => request_.end());
// }));

// test('cacheableRequest does not cache response if request is aborted before receiving first byte of response', withCallback((t, end) => {
// 	/* eslint-disable max-nested-callbacks */
// 	createTestServer().then(s => {
// 		s.get('/delay-start', (request_, response_) => {
// 			setTimeout(() => {
// 				response_.setHeader('cache-control', 'max-age=60');
// 				response_.end('hi');
// 			}, 50);
// 		});

// 		const cacheableRequest = new CacheableRequest(request);
// 		const options = url.parse(s.url);
// 		options.path = '/delay-start';
// 		cacheableRequest(options)
// 			.on('request', request_ => {
// 				request_.end();

// 				setTimeout(() => {
// 					request_.abort();
// 				}, 20);

// 				setTimeout(() => {
// 					cacheableRequest(options, async response => {
// 						t.is(response.fromCache, false);

// 						const body = await getStream(response);
// 						t.is(body, 'hi');
// 						end();
// 					}).on('request', request_ => request_.end());
// 				}, 100);
// 			});
// 	});
// 	/* eslint-enable max-nested-callbacks */
// }));

// test('cacheableRequest does not cache response if request is aborted after receiving part of the response', withCallback((t, end) => {
// 	/* eslint-disable max-nested-callbacks */
// 	createTestServer().then(s => {
// 		s.get('/delay-partial', (request_, response_) => {
// 			response_.setHeader('cache-control', 'max-age=60');
// 			response_.write('h');
// 			setTimeout(() => {
// 				response_.end('i');
// 			}, 50);
// 		});

// 		const cacheableRequest = new CacheableRequest(request);
// 		const options = url.parse(s.url);
// 		options.path = '/delay-partial';
// 		cacheableRequest(options)
// 			.on('request', request_ => {
// 				setTimeout(() => {
// 					request_.abort();
// 				}, 20);

// 				setTimeout(() => {
// 					cacheableRequest(options, async response => {
// 						t.is(response.fromCache, false);

// 						const body = await getStream(response);
// 						t.is(body, 'hi');
// 						end();
// 					}).on('request', request_ => request_.end());
// 				}, 100);
// 			});
// 	});
// 	/* eslint-enable max-nested-callbacks */
// }));

// test('cacheableRequest makes request even if initial DB connection fails (when opts.automaticFailover is enabled)', withCallback((t, end) => {
// 	const cacheableRequest = new CacheableRequest(request, 'sqlite://non/existent/database.sqlite');
// 	const options = url.parse(s.url);
// 	options.automaticFailover = true;
// 	cacheableRequest(options, response_ => {
// 		t.is(response_.statusCode, 200);
// 		end();
// 	})
// 		.on('error', () => {})
// 		.on('request', request_ => request_.end());
// }));

// test('cacheableRequest makes request even if current DB connection fails (when opts.automaticFailover is enabled)', withCallback((t, end) => {
// 	/* eslint-disable unicorn/error-message */
// 	const cache = {
// 		get() {
// 			throw new Error();
// 		},
// 		set() {
// 			throw new Error();
// 		},
// 		delete() {
// 			throw new Error();
// 		},
// 	};
// 	/* eslint-enable unicorn/error-message */

// 	const cacheableRequest = new CacheableRequest(request, cache);
// 	const options = url.parse(s.url);
// 	options.automaticFailover = true;
// 	cacheableRequest(options, response_ => {
// 		t.is(response_.statusCode, 200);
// 		end();
// 	})
// 		.on('error', () => {})
// 		.on('request', request_ => request_.end());
// }));

// test('cacheableRequest hashes request body as cache key', withCallback((t, end) => {
// 	const cache = {
// 		get(k) {
// 			t.is(k.split(':').pop(), '5d41402abc4b2a76b9719d911017c592');
// 		},
// 		set() {},
// 		delete() {},
// 	};
// 	const cacheableRequest = new CacheableRequest(request, cache);
// 	const options = url.parse(s.url);
// 	options.body = 'hello';
// 	options.method = 'POST';
// 	cacheableRequest(options, response_ => {
// 		t.is(response_.statusCode, 201);
// 		end();
// 	})
// 		.on('error', () => {})
// 		.on('request', request_ => request_.end());
// }));

// test('cacheableRequest skips cache for streamed body', withCallback((t, end) => {
// 	const cache = {
// 		get() {
// 			t.fail();
// 		},
// 		set() {},
// 		delete() {},
// 	};
// 	const cacheableRequest = new CacheableRequest(request, cache);
// 	const options = url.parse(s.url);
// 	options.body = new PassThrough();
// 	options.method = 'POST';
// 	cacheableRequest(options, response_ => {
// 		t.is(response_.statusCode, 201);
// 		end();
// 	})
// 		.on('error', () => {})
// 		.on('request', request_ => request_.end());
// 	options.body.end('hello');
// }));
