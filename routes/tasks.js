// routes/tasks.js
var express = require('express');
var Task = require('../models/task');
var User = require('../models/user');
var mongoose = require('mongoose');
var router = express.Router();
var apply = require('../utils/buildQuery').applyQueryParams;
var getQueryFilter = require('../utils/buildQuery').getQueryFilter;

router.get('/', async function(req, res) {
  try {
    const { query, count } = apply(Task, req, 100);
    if (count) {
      const filter = getQueryFilter(query);       
      const n = await Task.countDocuments(filter);
      return res.status(200).json({ message: 'OK', data: n });
    }
    const docs = await query.exec();
    return res.status(200).json({ message: 'OK', data: docs });
  } catch (e) {
    console.error('GET /api/tasks failed:', e.message);
    return res.status(500).json({ message: 'server error', data: null });
  }
});

router.post('/', async function(req, res) {
  const session = await Task.startSession();
  session.startTransaction();
  try {
    const name = req.body.name;
    const description = req.body.description || '';
    const deadlineMs = req.body.deadline;
    const completed = String(req.body.completed || 'false').toLowerCase() === 'true';
    const assignedUser = req.body.assignedUser || '';

    if (!name || !deadlineMs) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ message: 'name and deadline are required', data: null });
    }

    let assignedUserName = 'unassigned';
    if (assignedUser) {
      const user = await User.findById(assignedUser).session(session);
      if (!user) {
        await session.abortTransaction(); session.endSession();
        return res.status(400).json({ message: 'assignedUser does not exist', data: null });
      }
      assignedUserName = user.name;
    }

    const [task] = await Task.create([{
      name,
      description,
      deadline: new Date(Number(deadlineMs)),
      completed,
      assignedUser: assignedUser || '',
      assignedUserName
    }], { session });

    if (assignedUser && !completed) {
      await User.updateOne(
        { _id: assignedUser },
        { $addToSet: { pendingTasks: String(task._id) } },
        { session }
      );
    }

    await session.commitTransaction(); session.endSession();
    res.status(201).json({ message: 'created', data: task });
  } catch (e) {
    await session.abortTransaction(); session.endSession();
    res.status(500).json({ message: 'server error', data: null });
  }
});

router.get('/:id', async function(req, res) {
  try {
    const sel = (req.query.select || req.query.filter) ? JSON.parse(req.query.select || req.query.filter) : null;
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(404).json({ message: 'task not found', data: null });

    const doc = await Task.findById(req.params.id).select(sel || {});
    if (!doc) return res.status(404).json({ message: 'task not found', data: null });
    res.status(200).json({ message: 'OK', data: doc });
  } catch (e) {
    res.status(404).json({ message: 'task not found', data: null });
  }
});

router.put('/:id', async function(req, res) {
  const session = await Task.startSession();
  session.startTransaction();
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({ message: 'task not found', data: null });
    }

    const name = req.body.name;
    const description = req.body.description || '';
    const deadlineMs = req.body.deadline;
    const completed = String(req.body.completed || 'false').toLowerCase() === 'true';
    const assignedUser = req.body.assignedUser || '';

    if (!name || !deadlineMs) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ message: 'name and deadline are required', data: null });
    }

    const task = await Task.findById(id).session(session);
    if (!task) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({ message: 'task not found', data: null });
    }

    if (task.assignedUser && (task.assignedUser !== assignedUser || completed)) {
      await User.updateOne(
        { _id: task.assignedUser },
        { $pull: { pendingTasks: String(task._id) } },
        { session }
      );
    }

    let assignedUserName = 'unassigned';
    if (assignedUser) {
      const user = await User.findById(assignedUser).session(session);
      if (!user) {
        await session.abortTransaction(); session.endSession();
        return res.status(400).json({ message: 'assignedUser does not exist', data: null });
      }
      assignedUserName = user.name;

      if (!completed) {
        await User.updateOne(
          { _id: assignedUser },
          { $addToSet: { pendingTasks: String(task._id) } },
          { session }
        );
      }
    }

    task.name = name;
    task.description = description;
    task.deadline = new Date(Number(deadlineMs));
    task.completed = completed;
    task.assignedUser = assignedUser;
    task.assignedUserName = assignedUserName;

    await task.save({ session });
    await session.commitTransaction(); session.endSession();
    res.status(200).json({ message: 'updated', data: task });
  } catch (e) {
    await session.abortTransaction(); session.endSession();
    res.status(500).json({ message: 'server error', data: null });
  }
});

router.delete('/:id', async function(req, res) {
  const session = await Task.startSession();
  session.startTransaction();
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({ message: 'task not found', data: null });
    }

    const task = await Task.findById(id).session(session);
    if (!task) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({ message: 'task not found', data: null });
    }

    if (task.assignedUser) {
      await User.updateOne(
        { _id: task.assignedUser },
        { $pull: { pendingTasks: String(task._id) } },
        { session }
      );
    }

    await task.deleteOne({ session });
    await session.commitTransaction(); session.endSession();
    res.status(200).json({ message: 'deleted', data: null });
  } catch (e) {
    await session.abortTransaction(); session.endSession();
    res.status(500).json({ message: 'server error', data: null });
  }
});

module.exports = router;
