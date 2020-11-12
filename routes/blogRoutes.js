const mongoose = require('mongoose')
const requireLogin = require('../middlewares/requireLogin')

const Blog = mongoose.model('Blog')

module.exports = app => {
	app.get('/api/blogs/:id', requireLogin, async (req, res) => {
		const blog = await Blog.findOne({
			_user: req.user.id,
			_id: req.params.id
		})

		res.send(blog)
	})

	app.get('/api/blogs', requireLogin, async (req, res) => {
		const redis = require('redis')
		const redisUrl = 'redis://127.0.0.1:6379'
		const client = redis.createClient(redisUrl)
		//standard library included in the node runtime that includes a bunch of util functions
		//one of these utils is a function called promisify
		//promisify can take any function whatsoever that takes a cb as the last arg
		//and will return a promisified function
		const util = require('util')

		//setting client.get method to equal a promisified reference of client.get
		client.get = util.promisify(client.get)

		//NOTE: remember that the .get() method on client doesn't immediately return data
		//you need to pass in a cb function as a second argument as below
		//client.get(req.user.id, (err, val) => {})
		//HOWVER: because we promisified the function above (util.promisify()), we can now pass in an arg without a callback
		const cachedBlogs = await client.get(req.user.id)

		//do we have any cached data in redis related to this query
    //if yes, then respond to the request right away and return
    //remember that any cached redis data is stringified, so it has to be parsed here - JSON.parse()
    if (cachedBlogs) {
      console.log('SERVING FROM CACHE')
      return res.send(JSON.parse(cachedBlogs))
    }

    //if no, we need to respond to request and update our cache to store the data
		const blogs = await Blog.find({ _user: req.user.id })

    console.log('SERVING FROM MONGODB')
    res.send(blogs)
    
    //remember that redis can only store strings and numbers
    //so any returned data from the Blog query must be stringified
    client.set(req.user.id, JSON.stringify(blogs));
	})

	app.post('/api/blogs', requireLogin, async (req, res) => {
		const { title, content } = req.body

		const blog = new Blog({
			title,
			content,
			_user: req.user.id
		})

		try {
			await blog.save()
			res.send(blog)
		} catch (err) {
			res.send(400, err)
		}
	})
}
