// require in clearHash function from services so the middleware can automatically clear hash
// instead of repeating the code
const { clearHash } = require('../services/cache')

module.exports = async (req, res, next) => {
    
    // making this middleware async and doing await next() allows for the route handler to do everything
    // it needs to do and then after the route handler is complete, execution will come back to the middleware
    // and then the middleware will run
    await next()
    
    //after the route handler has executed, THEN we call clearHash
    clearHash(req.user.id)
}
