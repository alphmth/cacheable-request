/* eslint-disable unicorn/prefer-module */

const { request } = require('http');
const url = require('url');
const util = require('util'); // eslint-disable-line unicorn/import-style
const getStream = require('get-stream');
const createTestServer = require('create-test-server');
const delay = require('delay');
// Const sqlite3 = require('sqlite3');
// const pify = require('pify');
const CacheableRequest = require('this');
// Const Keyv = require('keyv');

const test = require('ava');

let s;

// Promisify cacheableRequest
const promisify = cacheableRequest => options => new Promise((resolve, reject) => {
	cacheableRequest(options, async response => {
		const body = await getStream(response);
		response.body = body;

		// Give the cache time to update
		await delay(100);

		resolve(response);
	})
		.on('request', request_ => request_.end())
		.once('error', reject);
});

test.before('setup', async () => {
	s = await createTestServer();

	let noStoreIndex = 0;
	s.get('/no-store', (request_, response_) => {
		noStoreIndex++;
		response_.setHeader('Cache-Control', 'public, no-cache, no-store');
		response_.end(noStoreIndex.toString());
	});

	let cacheIndex = 0;
	s.get('/cache', (request_, response_) => {
		cacheIndex++;
		response_.setHeader('Cache-Control', 'public, max-age=60');
		response_.end(cacheIndex.toString());
	});

	s.get('/last-modified', (request_, response_) => {
		response_.setHeader('Cache-Control', 'public, max-age=0');
		response_.setHeader('Last-Modified', 'Wed, 21 Oct 2015 07:28:00 GMT');
		let responseBody = 'last-modified';

		if (request_.headers['if-modified-since'] === 'Wed, 21 Oct 2015 07:28:00 GMT') {
			response_.statusCode = 304;
			responseBody = null;
		}

		response_.end(responseBody);
	});

	let calledFirstError = false;
	s.get('/first-error', (request_, response_) => {
		if (calledFirstError) {
			response_.end('ok');
			return;
		}

		calledFirstError = true;
		response_.statusCode = 502;
		response_.end('received 502');
	});

	s.get('/etag', (request_, response_) => {
		response_.setHeader('Cache-Control', 'public, max-age=0');
		response_.setHeader('ETag', '33a64df551425fcc55e4d42a148795d9f25f89d4');
		let responseBody = 'etag';

		if (request_.headers['if-none-match'] === '33a64df551425fcc55e4d42a148795d9f25f89d4') {
			response_.statusCode = 304;
			responseBody = null;
		}

		response_.end(responseBody);
	});

	s.get('/revalidate-modified', (request_, response_) => {
		response_.setHeader('Cache-Control', 'public, max-age=0');
		response_.setHeader('ETag', '33a64df551425fcc55e4d42a148795d9f25f89d4');
		let responseBody = 'revalidate-modified';

		if (request_.headers['if-none-match'] === '33a64df551425fcc55e4d42a148795d9f25f89d4') {
			response_.setHeader('ETag', '0000000000000000000000000000000000');
			responseBody = 'new-body';
		}

		response_.end(responseBody);
	});

	let cacheThenNoStoreIndex = 0;
	s.get('/cache-then-no-store-on-revalidate', (request_, response_) => {
		const cc = cacheThenNoStoreIndex === 0 ? 'public, max-age=0' : 'public, no-cache, no-store';
		cacheThenNoStoreIndex++;
		response_.setHeader('Cache-Control', cc);
		response_.end('cache-then-no-store-on-revalidate');
	});

	s.get('/echo', (request_, response_) => {
		const { headers, query, path, originalUrl, body } = request_;
		response_.json({
			headers,
			query,
			path,
			originalUrl,
			body,
		});
	});
});

test.after('cleanup', async () => {
	await s.close();
});

// Test('Non cacheable responses are not cached', async t => {
// 	const endpoint = '/no-store';
// 	const cache = new Map();
// 	const cacheableRequest = new CacheableRequest(request, cache);
// 	const cacheableRequestHelper = promisify(cacheableRequest);

// 	const firstResponseIntBody = await cacheableRequestHelper(s.url + endpoint);
// 	const firstResponseInt = Number(firstResponseIntBody.body);
// 	const secondResponseIntBody = await cacheableRequestHelper(s.url + endpoint);
// 	const secondResponseInt = Number(secondResponseIntBody.body);

// 	t.is(cache.size, 0);
// 	t.true(firstResponseInt < secondResponseInt);
// });

// test('Cacheable responses are cached', async t => {
// 	const endpoint = '/cache';
// 	const cache = new Map();
// 	const cacheableRequest = new CacheableRequest(request, cache);
// 	const cacheableRequestHelper = promisify(cacheableRequest);

// 	const firstResponse = await cacheableRequestHelper(s.url + endpoint);
// 	const secondResponse = await cacheableRequestHelper(s.url + endpoint);

// 	t.is(cache.size, 1);
// 	t.is(firstResponse.body, secondResponse.body);
// });

// test('Cacheable responses have unique cache key', async t => {
// 	const endpoint = '/cache';
// 	const cache = new Map();
// 	const cacheableRequest = new CacheableRequest(request, cache);
// 	const cacheableRequestHelper = promisify(cacheableRequest);

// 	const firstResponse = await cacheableRequestHelper(s.url + endpoint + '?foo');
// 	const secondResponse = await cacheableRequestHelper(s.url + endpoint + '?bar');

// 	t.is(cache.size, 2);
// 	t.not(firstResponse.body, secondResponse.body);
// });

async function testCacheKey(t, input, expected) {
	const expectKey = `cacheable-request:${expected}`;
	const okMessage = `OK ${expectKey}`;
	const cache = {
		get(key) {
			t.is(key, expectKey);
			throw new Error(okMessage);
		},
	};
	const cacheableRequest = new CacheableRequest(request, cache);
	const cacheableRequestHelper = promisify(cacheableRequest);
	await t.throwsAsync(
		cacheableRequestHelper(input),
		undefined,
		okMessage,
	);
}

testCacheKey.title = (providedTitle, input) => util.format(
	'Cache key is http.request compatible for arg %s(%j)%s',
	input.constructor.name,
	input,
	providedTitle ? ` (${providedTitle})` : '',
);
// test(
// 	testCacheKey,
// 	'http://www.example.com',
// 	'GET:http://www.example.com',
// );
// test(
// 	'strips default path',
// 	testCacheKey,
// 	'http://www.example.com/',
// 	'GET:http://www.example.com',
// );
test(
	'keeps trailing /',
	testCacheKey,
	'http://www.example.com/test/',
	'GET:http://www.example.com/test/',
);
// test(
// 	testCacheKey,
// 	new url.URL('http://www.example.com'), // eslint-disable-line node/prefer-global/url
// 	'GET:http://www.example.com',
// );
// test(
// 	'no requried properties',
// 	testCacheKey,
// 	{},
// 	'GET:http://localhost',
// );
// test(
// 	testCacheKey,
// 	{
// 		protocol: 'http:',
// 		host: 'www.example.com',
// 		port: 80,
// 		path: '/',
// 	},
// 	'GET:http://www.example.com',
// );
// test(
// 	testCacheKey,
// 	{
// 		hostname: 'www.example.com',
// 		port: 80,
// 		path: '/',
// 	},
// 	'GET:http://www.example.com',
// );
// test(
// 	testCacheKey,
// 	{
// 		hostname: 'www.example.com',
// 		port: 8080,
// 		path: '/',
// 	},
// 	'GET:http://www.example.com:8080',
// );
// test(
// 	testCacheKey,
// 	{ host: 'www.example.com' },
// 	'GET:http://www.example.com',
// );
// test(
// 	'hostname over host',
// 	testCacheKey,
// 	{
// 		host: 'www.example.com',
// 		hostname: 'xyz.example.com',
// 	},
// 	'GET:http://xyz.example.com',
// );
// test(
// 	'hostname defaults to localhost',
// 	testCacheKey,
// 	{ path: '/' },
// 	'GET:http://localhost',
// );
// test(
// 	'ignores pathname',
// 	testCacheKey,
// 	{
// 		path: '/foo',
// 		pathname: '/bar',
// 	},
// 	'GET:http://localhost/foo',
// );
// test(
// 	'ignores search',
// 	testCacheKey,
// 	{
// 		path: '/?foo=bar',
// 		search: '?bar=baz',
// 	},
// 	'GET:http://localhost/?foo=bar',
// );
// test(
// 	'ignores query',
// 	testCacheKey,
// 	{
// 		path: '/?foo=bar',
// 		query: { bar: 'baz' },
// 	},
// 	'GET:http://localhost/?foo=bar',
// );
// test(
// 	testCacheKey,
// 	{ auth: 'user:pass' },
// 	'GET:http://user:pass@localhost',
// );

// test(
// 	testCacheKey,
// 	{ method: 'POST' },
// 	'POST:http://localhost',
// );

// Test('request options path query is passed through', async t => {
// 	const cacheableRequest = new CacheableRequest(request);
// 	const cacheableRequestHelper = promisify(cacheableRequest);
// 	const argString = `${s.url}/echo?foo=bar`;
// 	const argURL = new url.URL(argString); // eslint-disable-line node/prefer-global/url
// 	const urlObject = url.parse(argString);
// 	const argOptions = {
// 		hostname: urlObject.hostname,
// 		port: urlObject.port,
// 		path: urlObject.path,
// 	};

// 	const inputs = [argString, argURL, argOptions];
// 	for (const input of inputs) {
// 		// eslint-disable-next-line no-await-in-loop
// 		const response = await cacheableRequestHelper(input);
// 		const body = JSON.parse(response.body);
// 		const message = util.format(
// 			'when request arg is %s(%j)',
// 			input.constructor.name,
// 			input,
// 		);
// 		t.is(body.query.foo, 'bar', message); // eslint-disable-line ava/assertion-arguments
// 	}
// });

// test('Setting opts.cache to false bypasses cache for a single request', async t => {
// 	const endpoint = '/cache';
// 	const cache = new Map();
// 	const cacheableRequest = new CacheableRequest(request, cache);
// 	const cacheableRequestHelper = promisify(cacheableRequest);
// 	const options = url.parse(s.url + endpoint);
// 	const optionsNoCache = { cache: false, ...options };

// 	const firstResponse = await cacheableRequestHelper(options);
// 	const secondResponse = await cacheableRequestHelper(options);
// 	const thirdResponse = await cacheableRequestHelper(optionsNoCache);
// 	const fourthResponse = await cacheableRequestHelper(options);

// 	t.false(firstResponse.fromCache);
// 	t.true(secondResponse.fromCache);
// 	t.false(thirdResponse.fromCache);
// 	t.true(fourthResponse.fromCache);
// });

// test('TTL is passed to cache', async t => {
// 	const endpoint = '/cache';
// 	const store = new Map();
// 	const cache = {
// 		get: store.get.bind(store),
// 		set(key, value, ttl) {
// 			t.is(typeof ttl, 'number');
// 			t.true(ttl > 0);
// 			return store.set(key, value, ttl);
// 		},
// 		delete: store.delete.bind(store),
// 	};
// 	const cacheableRequest = new CacheableRequest(request, cache);
// 	const cacheableRequestHelper = promisify(cacheableRequest);
// 	const options = { strictTtl: true, ...url.parse(s.url + endpoint) };

// 	t.plan(2);

// 	await cacheableRequestHelper(options);
// });

// test('TTL is not passed to cache if strictTtl is false', async t => {
// 	const endpoint = '/cache';
// 	const store = new Map();
// 	const cache = {
// 		get: store.get.bind(store),
// 		set(key, value, ttl) {
// 			t.true(typeof ttl === 'undefined');
// 			return store.set(key, value, ttl);
// 		},
// 		delete: store.delete.bind(store),
// 	};
// 	const cacheableRequest = new CacheableRequest(request, cache);
// 	const cacheableRequestHelper = promisify(cacheableRequest);
// 	const options = { strictTtl: false, ...url.parse(s.url + endpoint) };

// 	t.plan(1);

// 	await cacheableRequestHelper(options);
// });

// test('Setting opts.maxTtl will limit the TTL', async t => {
// 	const endpoint = '/cache';
// 	const store = new Map();
// 	const cache = {
// 		get: store.get.bind(store),
// 		set(key, value, ttl) {
// 			t.is(ttl, 1000);
// 			return store.set(key, value, ttl);
// 		},
// 		delete: store.delete.bind(store),
// 	};
// 	const cacheableRequest = new CacheableRequest(request, cache);
// 	const cacheableRequestHelper = promisify(cacheableRequest);
// 	const options = {
// 		...url.parse(s.url + endpoint),
// 		maxTtl: 1000,
// 	};

// 	t.plan(1);

// 	await cacheableRequestHelper(options);
// });

// test('Setting opts.maxTtl when opts.strictTtl is true will use opts.maxTtl if it\'s smaller', async t => {
// 	const endpoint = '/cache';
// 	const store = new Map();
// 	const cache = {
// 		get: store.get.bind(store),
// 		set(key, value, ttl) {
// 			t.true(ttl === 1000);
// 			return store.set(key, value, ttl);
// 		},
// 		delete: store.delete.bind(store),
// 	};
// 	const cacheableRequest = new CacheableRequest(request, cache);
// 	const cacheableRequestHelper = promisify(cacheableRequest);
// 	const options = {
// 		...url.parse(s.url + endpoint),
// 		strictTtl: true,
// 		maxTtl: 1000,
// 	};

// 	t.plan(1);

// 	await cacheableRequestHelper(options);
// });

// test('Setting opts.maxTtl when opts.strictTtl is true will use remote TTL if it\'s smaller', async t => {
// 	const endpoint = '/cache';
// 	const store = new Map();
// 	const cache = {
// 		get: store.get.bind(store),
// 		set(key, value, ttl) {
// 			t.true(ttl < 100_000);
// 			return store.set(key, value, ttl);
// 		},
// 		delete: store.delete.bind(store),
// 	};
// 	const cacheableRequest = new CacheableRequest(request, cache);
// 	const cacheableRequestHelper = promisify(cacheableRequest);
// 	const options = {
// 		...url.parse(s.url + endpoint),
// 		strictTtl: true,
// 		maxTtl: 100_000,
// 	};

// 	t.plan(1);

// 	await cacheableRequestHelper(options);
// });

// test('Stale cache entries with Last-Modified headers are revalidated', async t => {
// 	const endpoint = '/last-modified';
// 	const cache = new Map();
// 	const cacheableRequest = new CacheableRequest(request, cache);
// 	const cacheableRequestHelper = promisify(cacheableRequest);

// 	const firstResponse = await cacheableRequestHelper(s.url + endpoint);
// 	const secondResponse = await cacheableRequestHelper(s.url + endpoint);

// 	t.is(cache.size, 1);
// 	t.is(firstResponse.statusCode, 200);
// 	t.is(secondResponse.statusCode, 200);
// 	t.false(firstResponse.fromCache);
// 	t.true(secondResponse.fromCache);
// 	t.is(firstResponse.body, 'last-modified');
// 	t.is(firstResponse.body, secondResponse.body);
// });

// test('Stale cache entries with ETag headers are revalidated', async t => {
// 	const endpoint = '/etag';
// 	const cache = new Map();
// 	const cacheableRequest = new CacheableRequest(request, cache);
// 	const cacheableRequestHelper = promisify(cacheableRequest);

// 	const firstResponse = await cacheableRequestHelper(s.url + endpoint);
// 	const secondResponse = await cacheableRequestHelper(s.url + endpoint);

// 	t.is(cache.size, 1);
// 	t.is(firstResponse.statusCode, 200);
// 	t.is(secondResponse.statusCode, 200);
// 	t.false(firstResponse.fromCache);
// 	t.true(secondResponse.fromCache);
// 	t.is(firstResponse.body, 'etag');
// 	t.is(firstResponse.body, secondResponse.body);
// });

// test('Stale cache entries that can\'t be revalidate are deleted from cache', async t => {
// 	const endpoint = '/cache-then-no-store-on-revalidate';
// 	const cache = new Map();
// 	const cacheableRequest = new CacheableRequest(request, cache);
// 	const cacheableRequestHelper = promisify(cacheableRequest);

// 	const firstResponse = await cacheableRequestHelper(s.url + endpoint);
// 	t.is(cache.size, 1);
// 	const secondResponse = await cacheableRequestHelper(s.url + endpoint);

// 	t.is(cache.size, 0);
// 	t.is(firstResponse.statusCode, 200);
// 	t.is(secondResponse.statusCode, 200);
// 	t.is(firstResponse.body, 'cache-then-no-store-on-revalidate');
// 	t.is(firstResponse.body, secondResponse.body);
// });

// test('Response objects have fromCache property set correctly', async t => {
// 	const endpoint = '/cache';
// 	const cache = new Map();
// 	const cacheableRequest = new CacheableRequest(request, cache);
// 	const cacheableRequestHelper = promisify(cacheableRequest);

// 	const response = await cacheableRequestHelper(s.url + endpoint);
// 	const cachedResponse = await cacheableRequestHelper(s.url + endpoint);

// 	t.false(response.fromCache);
// 	t.true(cachedResponse.fromCache);
// });

// test('Revalidated responses that are modified are passed through', async t => {
// 	const endpoint = '/revalidate-modified';
// 	const cache = new Map();
// 	const cacheableRequest = new CacheableRequest(request, cache);
// 	const cacheableRequestHelper = promisify(cacheableRequest);

// 	const firstResponse = await cacheableRequestHelper(s.url + endpoint);
// 	const secondResponse = await cacheableRequestHelper(s.url + endpoint);

// 	t.is(firstResponse.statusCode, 200);
// 	t.is(secondResponse.statusCode, 200);
// 	t.is(firstResponse.body, 'revalidate-modified');
// 	t.is(secondResponse.body, 'new-body');
// });

// test('Undefined callback parameter inside cache logic is handled', async t => {
// 	const endpoint = '/cache';
// 	const cache = new Map();
// 	const cacheableRequest = new CacheableRequest(request, cache);
// 	const cacheableRequestHelper = promisify(cacheableRequest);

// 	await cacheableRequestHelper(s.url + endpoint);
// 	cacheableRequest(s.url + endpoint);
// 	await delay(500);
// 	t.pass();
// });

// test('Custom Keyv instance adapters used', async t => {
// 	const cache = new Keyv();
// 	const endpoint = '/cache';
// 	const cacheableRequest = new CacheableRequest(request, cache);
// 	const cacheableRequestHelper = promisify(cacheableRequest);
// 	const response = await cacheableRequestHelper(s.url + endpoint);
// 	const cached = await cache.get(`GET:${s.url + endpoint}`);
// 	t.is(response.body, cached.body.toString());
// });

// test('Keyv cache adapters load via connection uri', async t => {
// 	const endpoint = '/cache';
// 	const cacheableRequest = new CacheableRequest(request, 'sqlite://test/testdb.sqlite');
// 	const cacheableRequestHelper = promisify(cacheableRequest);
// 	const db = new sqlite3.Database('test/testdb.sqlite');
// 	const query = pify(db.all.bind(db));

// 	const firstResponse = await cacheableRequestHelper(s.url + endpoint);
// 	await delay(1000);
// 	const secondResponse = await cacheableRequestHelper(s.url + endpoint);
// 	const cacheResult = await query(`SELECT * FROM keyv WHERE "key" = "cacheable-request:GET:${s.url + endpoint}"`);

// 	t.false(firstResponse.fromCache);
// 	t.true(secondResponse.fromCache);
// 	t.is(cacheResult.length, 1);

// 	await query('DELETE FROM keyv');
// });

// test('ability to force refresh', async t => {
// 	const endpoint = '/cache';
// 	const cache = new Map();
// 	const cacheableRequest = new CacheableRequest(request, cache);
// 	const cacheableRequestHelper = promisify(cacheableRequest);
// 	const options = url.parse(s.url + endpoint);

// 	const firstResponse = await cacheableRequestHelper(options);
// 	const secondResponse = await cacheableRequestHelper({ ...options, forceRefresh: true });
// 	const thirdResponse = await cacheableRequestHelper(options);
// 	t.not(firstResponse.body, secondResponse.body);
// 	t.is(secondResponse.body, thirdResponse.body);
// });

// test('checks status codes when comparing cache & response', async t => {
// 	const endpoint = '/first-error';
// 	const cache = new Map();
// 	const cacheableRequest = new CacheableRequest(request, cache);
// 	const cacheableRequestHelper = promisify(cacheableRequest);
// 	const options = url.parse(s.url + endpoint);

// 	const firstResponse = await cacheableRequestHelper(options);
// 	const secondResponse = await cacheableRequestHelper(options);
// 	t.is(firstResponse.body, 'received 502');
// 	t.is(secondResponse.body, 'ok');
// });
