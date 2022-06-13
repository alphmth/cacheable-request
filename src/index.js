/* eslint-disable unicorn/prefer-module */
/* eslint-disable node/no-deprecated-api */
'use strict';

const EventEmitter = require('events');
const urlLib = require('url');
const crypto = require('crypto');
const { Readable } = require('stream');
//const normalizeUrl = require('normalize-url');
const getStream = require('get-stream');
const CachePolicy = require('http-cache-semantics');
const Response = require('responselike');
const lowercaseKeys = require('lowercase-keys');
const cloneResponse = require('clone-response');
const Keyv = require('keyv');
const { resolve } = require('path');
const normalize = require('./normalize')

class CacheableRequest {
	constructor(request, cacheAdapter) {
		if (typeof request !== 'function') {
			throw new TypeError('Parameter `request` must be a function');
		}

		if (cacheAdapter instanceof Keyv) {
			this.cache = cacheAdapter;
		} else {
			this.cache = new Keyv({
				uri: typeof cacheAdapter === 'string' && cacheAdapter,
				store: typeof cacheAdapter !== 'string' && cacheAdapter,
				namespace: 'cacheable-request',
			});
		}

		return this.createCacheableRequest(request); // eslint-disable-line no-constructor-return
	}

	createCacheableRequest(request) {
		return async (options, cb) => {
			let url;
			if (typeof options === 'string') {
				url = normalizeUrlObject(urlLib.parse(options));
				options = {};
			} else if (options instanceof urlLib.URL) { // eslint-disable-line node/prefer-global/url
				url = normalizeUrlObject(urlLib.parse(options.toString()));
				options = {};
			} else {
				const [pathname, ...searchParts] = (options.path || '').split('?');
				const search = searchParts.length > 0
					? `?${searchParts.join('?')}`
					: '';
				url = normalizeUrlObject({ ...options, pathname, search });
			}

			options = {
				headers: {},
				method: 'GET',
				cache: true,
				strictTtl: false,
				automaticFailover: false,
				...options,
				...urlObjectToRequestOptions(url),
			};
			options.headers = lowercaseKeys(options.headers);

			const ee = new EventEmitter();


			let a = undefined;
			let mod = undefined;
			mod = await normalize('http://user:pass@localhost/', {
					stripWWW: false,
					removeTrailingSlash: false,
					stripAuthentication: false,
				},);

			console.log(mod);

			// const normalizedUrlString = normalizeUrl(
			// 	urlLib.format(url),
			// 	{
			// 		stripWWW: false,
			// 		removeTrailingSlash: false,
			// 		stripAuthentication: false,
			// 	},
			// );

			let key = `${options.method}:${"normalizedUrlString"}`;

			// POST, PATCH, and PUT requests may be cached, depending on the response
			// cache-control headers. As a result, the body of the request should be
			// added to the cache key in order to avoid collisions.
			if (options.body && ['POST', 'PATCH', 'PUT'].includes(options.method)) {
				if (options.body instanceof Readable) {
					// Streamed bodies should completely skip the cache because they may
					// or may not be hashable and in either case the stream would need to
					// close before the cache key could be generated.
					options.cache = false;
				} else {
					key += `:${crypto.createHash('md5').update(options.body).digest('hex')}`;
				}
			}

			let revalidate = false;
			let madeRequest = false;

			const makeRequest = options_ => {
				madeRequest = true;
				let requestErrored = false;
				let requestErrorCallback;

				const requestErrorPromise = new Promise(resolve => {
					requestErrorCallback = () => {
						if (!requestErrored) {
							requestErrored = true;
							resolve();
						}
					};
				});

				const handler = response => {
					if (revalidate && !options_.forceRefresh) {
						response.status = response.statusCode;
						const revalidatedPolicy = CachePolicy.fromObject(revalidate.cachePolicy).revalidatedPolicy(options_, response);
						if (!revalidatedPolicy.modified) {
							const headers = revalidatedPolicy.policy.responseHeaders();
							response = new Response(revalidate.statusCode, headers, revalidate.body, revalidate.url);
							response.cachePolicy = revalidatedPolicy.policy;
							response.fromCache = true;
						}
					}

					if (!response.fromCache) {
						response.cachePolicy = new CachePolicy(options_, response, options_);
						response.fromCache = false;
					}

					let clonedResponse;
					if (options_.cache && response.cachePolicy.storable()) {
						clonedResponse = cloneResponse(response);

						(async () => {
							try {
								const bodyPromise = getStream.buffer(response);

								await Promise.race([
									requestErrorPromise,
									new Promise(resolve => response.once('end', resolve)), // eslint-disable-line no-promise-executor-return
								]);

								const body = await bodyPromise;

								const value = {
									cachePolicy: response.cachePolicy.toObject(),
									url: response.url,
									statusCode: response.fromCache ? revalidate.statusCode : response.statusCode,
									body,
								};

								let ttl = options_.strictTtl ? response.cachePolicy.timeToLive() : undefined;
								if (options_.maxTtl) {
									ttl = ttl ? Math.min(ttl, options_.maxTtl) : options_.maxTtl;
								}

								await this.cache.set(key, value, ttl);
							} catch (error) {
								ee.emit('error', new CacheableRequest.CacheError(error));
							}
						})();
					} else if (options_.cache && revalidate) {
						(async () => {
							try {
								await this.cache.delete(key);
							} catch (error) {
								ee.emit('error', new CacheableRequest.CacheError(error));
							}
						})();
					}

					ee.emit('response', clonedResponse || response);
					if (typeof cb === 'function') {
						cb(clonedResponse || response);
					}
				};

				try {
					const request_ = request(options_, handler);
					request_.once('error', requestErrorCallback);
					request_.once('abort', requestErrorCallback);
					ee.emit('request', request_);
				} catch (error) {
					ee.emit('error', new CacheableRequest.RequestError(error));
				}
			};

			(async () => {
				const get = async options_ => {
					await Promise.resolve();

					const cacheEntry = options_.cache ? await this.cache.get(key) : undefined;
					if (typeof cacheEntry === 'undefined') {
						return makeRequest(options_);
					}

					const policy = CachePolicy.fromObject(cacheEntry.cachePolicy);
					if (policy.satisfiesWithoutRevalidation(options_) && !options_.forceRefresh) {
						const headers = policy.responseHeaders();
						const response = new Response(cacheEntry.statusCode, headers, cacheEntry.body, cacheEntry.url);
						response.cachePolicy = policy;
						response.fromCache = true;

						ee.emit('response', response);
						if (typeof cb === 'function') {
							cb(response);
						}
					} else {
						revalidate = cacheEntry;
						options_.headers = policy.revalidationHeaders(options_);
						makeRequest(options_);
					}
				};

				const errorHandler = error => ee.emit('error', new CacheableRequest.CacheError(error));
				this.cache.once('error', errorHandler);
				ee.on('response', () => this.cache.removeListener('error', errorHandler));

				try {
					await get(options);
				} catch (error) {
					if (options.automaticFailover && !madeRequest) {
						makeRequest(options);
					}

					ee.emit('error', new CacheableRequest.CacheError(error));
				}
			})();

			return ee;
		};
	}
}

function urlObjectToRequestOptions(url) {
	const options = { ...url };
	options.path = `${url.pathname || '/'}${url.search || ''}`;
	delete options.pathname;
	delete options.search;
	return options;
}

function normalizeUrlObject(url) {
	// If url was parsed by url.parse or new URL:
	// - hostname will be set
	// - host will be hostname[:port]
	// - port will be set if it was explicit in the parsed string
	// Otherwise, url was from request options:
	// - hostname or host may be set
	// - host shall not have port encoded
	return {
		protocol: url.protocol,
		auth: url.auth,
		hostname: url.hostname || url.host || 'localhost',
		port: url.port,
		pathname: url.pathname,
		search: url.search,
	};
}

CacheableRequest.RequestError = class extends Error {
	constructor(error) {
		super(error.message);
		this.name = 'RequestError';
		Object.assign(this, error);
	}
};

CacheableRequest.CacheError = class extends Error {
	constructor(error) {
		super(error.message);
		this.name = 'CacheError';
		Object.assign(this, error);
	}
};

module.exports = CacheableRequest;
