var express = require('express');
var User = require('../models/user');
var Task = require('../models/task');
var mongoose = require('mongoose');
var router = express.Router();
var bqp = require('../utils/buildQuery');
var apply = bqp.applyQueryParams;
var getQueryFilter = bqp.getQueryFilter;

router.get('/', async function (req, res) {
  try {
    const { query, count } = apply(User, req, undefined);
    if (count) {
      const filter = getQueryFilter(query);
      const n = await User.countDocuments(filter);
      return res.status(200).json({ message: 'OK', data: n });
    }
    const docs = await query.exec();
    return res.status(200).json({ message: 'OK', data: docs });
  } catch (e) {
    console.error('GET /api/users failed:', e.message);
    return res.status(500).json({ message: 'server error', data: null });
  }
});

router.post('/', async function (req, res) {
  try {
    const name = req.body.name;
    const email = req.body.email;
    const pendingTasks = Array.isArray(req.body.pendingTasks)
      ? req.body.pendingTasks
      : req.body.pendingTasks
      ? [].concat(req.body.pendingTasks)
      : [];

    if (!name || !email)
      return res
        .status(400)
        .json({ message: 'name and email are required', data: null });

    const exists = await User.findOne({ email });
    if (exists)
      return res
        .status(400)
        .json({ message: 'email already in use', data: null });

    const user = await User.create({ name, email, pendingTasks });
    res.status(201).json({ message: 'created', data: user });
  } catch (e) {
    res.status(500).json({ message: 'server error', data: null });
  }
});

router.get('/:id', async function (req, res) {
  try {
    const sel =
      req.query.select || req.query.filter
        ? JSON.parse(req.query.select || req.query.filter)
        : null;
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(404).json({ message: 'user not found', data: null });

    const doc = await User.findById(req.params.id).select(sel || {});
    if (!doc)
      return res.status(404).json({ message: 'user not found', data: null });
    res.status(200).json({ message: 'OK', data: doc });
  } catch (e) {
    res.status(404).json({ message: 'user not found', data: null });
  }
});

router.put('/:id', async function (req, res) {
  const session = await User.startSession();
  session.startTransaction();
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'user not found', data: null });
    }

    const name = req.body.name;
    const email = req.body.email;
    let pendingTasks = req.body.pendingTasks;
    if (typeof pendingTasks === 'string') pendingTasks = [pendingTasks];
    if (!Array.isArray(pendingTasks)) pendingTasks = [];

    if (!name || !email) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ message: 'name and email are required', data: null });
    }

    const conflict = await User.findOne({ email, _id: { $ne: id } });
    if (conflict) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ message: 'email already in use', data: null });
    }

    const user = await User.findById(id).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'user not found', data: null });
    }

    const newSet = new Set(pendingTasks.map(String));
    await Task.updateMany(
      { assignedUser: String(user._id), _id: { $nin: Array.from(newSet) } },
      { $set: { assignedUser: '', assignedUserName: 'unassigned' } },
      { session }
    );

    const tasksToAssign = await Task.find({
      _id: { $in: Array.from(newSet) },
    }).session(session);
    for (const t of tasksToAssign) {
      if (t.assignedUser && t.assignedUser !== String(user._id)) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          message: 'task already assigned to another user',
          data: String(t._id),
        });
      }
      if (!t.completed) {
        await Task.updateOne(
          { _id: t._id },
          { $set: { assignedUser: String(user._id), assignedUserName: name } },
          { session }
        );
      }
    }

    user.name = name;
    user.email = email;
    user.pendingTasks = pendingTasks;
    await user.save({ session });

    await session.commitTransaction();
    session.endSession();
    res.status(200).json({ message: 'updated', data: user });
  } catch (e) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: 'server error', data: null });
  }
});

router.delete('/:id', async function (req, res) {
  const session = await User.startSession();
  session.startTransaction();
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'user not found', data: null });
    }

    const user = await User.findById(id).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'user not found', data: null });
    }

    await Task.updateMany(
      { _id: { $in: user.pendingTasks } },
      { $set: { assignedUser: '', assignedUserName: 'unassigned' } },
      { session }
    );

    await user.deleteOne({ session });
    await session.commitTransaction();
    session.endSession();
    res.status(200).json({ message: 'deleted', data: null });
  } catch (e) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: 'server error', data: null });
  }
});

module.exports = router;
