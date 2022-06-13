const normalize = async (key, options) => {
  console.log('inputsss');
  return import('normalize-url').then(module => module.default(key, options));
}

module.exports = normalize;