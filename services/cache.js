const mongoose = require('mongoose')
//require in redis
const redis = require('redis')
//standard library included in the node runtime that includes a bunch of util functions
//one of these utils is a function called promisify
//promisify can take any function whatsoever that takes a cb as the last arg
//and will return a promisified function
const util = require('util')
const redisUrl = 'redis://127.0.0.1:6379'
const client = redis.createClient(redisUrl)
//setting client.get method to equal a promisified reference of client.get
client.get = util.promisify(client.get)
//also promisifying hashset get function
client.hget = util.promisify(client.hget)

//declare exec as original mongoose.Query.prototype.exec method
//so that we can use the original in the new function we created along with
//the caching additions when exec is patched
const exec = mongoose.Query.prototype.exec

//we're creating a prototype function on mongoose.Query that we can use on any instance
//of mongoose.Query
// an options object will be passed in as an arg (defaulted to {} here)
mongoose.Query.prototype.cache = function (options = {}) {
	//if anyone calls cache, we will assign a random property to true
	this.useCache = true
	// we are going to dynamically specify the top level key for this example, but
	// what the top level key is will really depend on the project, here it's ID
	// if you pass a key property into the options obj, that's the top level has key that's used
	// remember that any hash key used must be a number or a string - defaulting here to empty string (used for this example)
	this.hashKey = JSON.stringify(options.key || '')
	// IMPORTANT: writing return this in the function allows us to use the method as a chainable method
	// this makes sense because you are returning back the mongoose.Query instance
	// and it can then be used with other mongoose methods
	return this
}

//not using arrow function because we want to reference the function using the 'this' keyword
//here we are overriding the exec function with our own custom one
mongoose.Query.prototype.exec = async function () {
	// we're using the this.useCache instance variable declared in the function above
	// to first check if we should use caching on the query
	if (!this.useCache) {
		return exec.apply(this, arguments)
	}
	//getQuery is deprecated in newer versions of mongoose but in this version it should work fine
	//assigning the query and collection name to a new object
	const key = JSON.stringify(
		Object.assign({}, this.getQuery(), {
			collection: this.mongooseCollection.name
		})
	)

	//see if we have a value for 'key' in redis
	// we're using hget because we're checking a hash set with a top level key created in the .cache() method
	const cacheValue = await client.hget(this.hashKey, key)

	//if we do, return this:
	if (cacheValue) {
		//the exec function expects us to return mongoose documents (aka Model Instances)
		//here we are taking the object, and converting it to a mongoose model instance
		//using 'new this.model'
		//this way the data returned by exec() is valid and will not throw an error
		//new this.model is same as new ModelName({key: value, key: value})

		//we need to parse out JSON values from cached value first
		//to check to make sure it's not in an array, if it is, piece those aray values out
		const doc = JSON.parse(cacheValue)

		//this static method checks if doc is an array
		return Array.isArray(doc)
			? doc.map(d => new this.model(d))
			: new this.model(doc)
	}

	//otherwise, issue query and store the result in redis
	const result = await exec.apply(this, arguments)
	//because this result is a mongoDB document, we must first turn it into JSON
	//before we can store it in redis
	//we also added cache expiration before we set the cache value
	//to do this in redis, last two args must be 'EX' and the number of seconds before the cached value expires
	client.hmset(this.hashKey, key, JSON.stringify(result), 'EX', 10)
	console.log(result)
	return result
}

module.exports = {
	clearHash: (hashKey) => {
		//the .del() method on redis client deletes data with that hash  key
		//double check that the hashKey is a string, and not passed in as an array or obj
		client.del(JSON.stringify(hashKey))
	}
}
