/*
 * Connect all of your endpoints together here.
 */
module.exports = function (app, router) {
    app.use('/api', require('./home.js')(router)); // keep starter home route
    app.use('/api/users', require('./users.js'));  // NEW
    app.use('/api/tasks', require('./tasks.js'));  // NEW

    app.get('/api/health', (req, res) => {
        res.status(200).json({ message: 'OK', data: 'Llama.io API' });
    });
};
