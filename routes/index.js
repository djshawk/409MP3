/*
 * Connect all of your endpoints together here.
 */
module.exports = function (app, router) {
    app.use('/api', require('./home.js')(router));
    app.use('/api/users', require('./users.js'));  
    app.use('/api/tasks', require('./tasks.js'));  

    app.get('/api/health', (req, res) => {
        res.status(200).json({ message: 'OK', data: 'Data Works' });
    });
};
