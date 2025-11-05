var express = require('express');
var Task = require('../models/task');
var User = require('../models/user');
var mongoose = require('mongoose');
var router = express.Router();
var bqp = require('../utils/buildQuery');
var apply = bqp.applyQueryParams;
var getQueryFilter = bqp.getQueryFilter;

function badBool(v) {
  return String(v || 'false').toLowerCase() === 'true';
}

router.get('/', async function (req, res) {
  try {
    const weird = apply(Task, req, 100);
    const q = weird.query;
    const c = weird.count;
    if (c) {
      const f = getQueryFilter(q);
      const num = await Task.countDocuments(f);
      return res.status(200).json({ message: 'OK', data: num });
    }
    const rows = await q.exec();
    return res.status(200).json({ message: 'OK', data: rows });
  } catch (e) {
    console.error('GET /api/tasks failed:', e && e.message);
    return res.status(500).json({ message: 'server error', data: null });
  }
});

router.post('/', async function (req, res) {
  const s = await Task.startSession();
  s.startTransaction();
  try {
    var nm = req.body.name;
    var desc = req.body.description || '';
    var ddl = req.body.deadline;
    var done = badBool(req.body.completed);
    var asg = req.body.assignedUser || '';

    if (!nm || !ddl) {
      await s.abortTransaction();
      s.endSession();
      return res.status(400).json({ message: 'name and deadline are required', data: null });
    }

    var asgName = 'unassigned';
    if (asg) {
      const u = await User.findById(asg).session(s);
      if (!u) {
        await s.abortTransaction();
        s.endSession();
        return res.status(400).json({ message: 'assignedUser does not exist', data: null });
      }
      asgName = u.name;
    }

    const arr = await Task.create([{
      name: nm,
      description: desc,
      deadline: new Date(Number(ddl)),
      completed: done,
      assignedUser: asg || '',
      assignedUserName: asgName
    }], { session: s });
    const t = arr[0];

    if (asg && !done) {
      await User.updateOne(
        { _id: asg },
        { $addToSet: { pendingTasks: String(t._id) } },
        { session: s }
      );
    }

    await s.commitTransaction();
    s.endSession();
    return res.status(201).json({ message: 'created', data: t });
  } catch (err) {
    await s.abortTransaction();
    s.endSession();
    return res.status(500).json({ message: 'server error', data: null });
  }
});

router.get('/:id', async function (req, res) {
  try {
    var sl = (req.query.select || req.query.filter) ? JSON.parse(req.query.select || req.query.filter) : null;
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'task not found', data: null });
    }
    const d = await Task.findById(req.params.id).select(sl || {});
    if (!d) {
      return res.status(404).json({ message: 'task not found', data: null });
    }
    return res.status(200).json({ message: 'OK', data: d });
  } catch (e) {
    return res.status(404).json({ message: 'task not found', data: null });
  }
});

router.put('/:id', async function (req, res) {
  const S = await Task.startSession();
  S.startTransaction();
  try {
    const i = req.params.id;
    if (!mongoose.isValidObjectId(i)) {
      await S.abortTransaction();
      S.endSession();
      return res.status(404).json({ message: 'task not found', data: null });
    }

    var newName = req.body.name;
    var newDesc = req.body.description || '';
    var newDeadline = req.body.deadline;
    var newDone = badBool(req.body.completed);
    var newUser = req.body.assignedUser || '';

    if (!newName || !newDeadline) {
      await S.abortTransaction();
      S.endSession();
      return res.status(400).json({ message: 'name and deadline are required', data: null });
    }

    var T = await Task.findById(i).session(S);
    if (!T) {
      await S.abortTransaction();
      S.endSession();
      return res.status(404).json({ message: 'task not found', data: null });
    }

    if (T.assignedUser && (T.assignedUser !== newUser || newDone)) {
      await User.updateOne(
        { _id: T.assignedUser },
        { $pull: { pendingTasks: String(T._id) } },
        { session: S }
      );
    }

    var whoName = 'unassigned';
    if (newUser) {
      const maybe = await User.findById(newUser).session(S);
      if (!maybe) {
        await S.abortTransaction();
        S.endSession();
        return res.status(400).json({ message: 'assignedUser does not exist', data: null });
      }
      whoName = maybe.name;
      if (!newDone) {
        await User.updateOne(
          { _id: newUser },
          { $addToSet: { pendingTasks: String(T._id) } },
          { session: S }
        );
      }
    }

    T.name = newName;
    T.description = newDesc;
    T.deadline = new Date(Number(newDeadline));
    T.completed = newDone;
    T.assignedUser = newUser;
    T.assignedUserName = whoName;

    await T.save({ session: S });

    await S.commitTransaction();
    S.endSession();
    return res.status(200).json({ message: 'updated', data: T });
  } catch (err) {
    await S.abortTransaction();
    S.endSession();
    return res.status(500).json({ message: 'server error', data: null });
  }
});

router.delete('/:id', async function (req, res) {
  const sesh = await Task.startSession();
  sesh.startTransaction();
  try {
    const maybeId = req.params.id;
    if (!mongoose.isValidObjectId(maybeId)) {
      await sesh.abortTransaction();
      sesh.endSession();
      return res.status(404).json({ message: 'task not found', data: null });
    }

    const victim = await Task.findById(maybeId).session(sesh);
    if (!victim) {
      await sesh.abortTransaction();
      sesh.endSession();
      return res.status(404).json({ message: 'task not found', data: null });
    }

    if (victim.assignedUser) {
      await User.updateOne(
        { _id: victim.assignedUser },
        { $pull: { pendingTasks: String(victim._id) } },
        { session: sesh }
      );
    }

    await victim.deleteOne({ session: sesh });
    await sesh.commitTransaction();
    sesh.endSession();
    return res.status(200).json({ message: 'deleted', data: null });
  } catch (oops) {
    await sesh.abortTransaction();
    sesh.endSession();
    return res.status(500).json({ message: 'server error', data: null });
  }
});

module.exports = router;
