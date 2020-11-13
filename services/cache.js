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

//declare exec as original mongoose.Query.prototype.exec method
//so that we can use the original in the new function we created along with
//the caching additions when exec is patched
const exec = mongoose.Query.prototype.exec

//not using arrow function because we want to reference the function using the 'this' keyword
//here we are overriding the exec function with our own custom one
mongoose.Query.prototype.exec = async function () {
	//getQuery is deprecated in newer versions of mongoose but in this version it should work fine
	//assigning the query and collection name to a new object
	const key = JSON.stringify(
		Object.assign({}, this.getQuery(), {
			collection: this.mongooseCollection.name
		})
	)

	//see if we have a value for 'key' in redis
	const cacheValue = await client.get(key)

	//if we do, return this:
	if (cacheValue) {
        //the exec function expects us to return mongoose documents (aka Model Instances)
        //here we are taking the object, and converting it to a mongoose model instance
        //using 'new this.model'
        //this way the data returned by exec() is valid and will not throw an error
        //new this.model is same as new ModelName({key: value, key: value})
        new this.model(JSON.parse(cacheValue))
        
        
        return JSON.parse(cacheValue)
	}

	//otherwise, issue query and store the result in redis
	const result = await exec.apply(this, arguments)
	//because this result is a mongoDB document, we must first turn it into JSON
	//before we can store it in redis
	client.set(key, JSON.stringify(result))
    console.log(result)
    return result;
}
